use axum::{
    body::Body,
    extract::{Path as AxumPath, State},
    http::{header, HeaderMap, HeaderName, HeaderValue, Method, Request, StatusCode},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use rand::{rngs::OsRng, Rng, RngCore};
use rusqlite::{params, Connection, OpenFlags, OptionalExtension};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::{HashMap, VecDeque},
    path::{Path, PathBuf},
    sync::Arc,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tokio::sync::Mutex;
use tower_http::{
    cors::{AllowOrigin, CorsLayer},
    trace::TraceLayer,
};

pub const BUILD_SHA: &str = match option_env!("BUILD_SHA") {
    Some(value) => value,
    None => "dev",
};
const BOARD_WIDTH: i32 = 8;
const BOARD_HEIGHT: i32 = 7;
const MAX_ROUNDS: u8 = 6;
const PLAN_SIZE: usize = 3;
const ROUND_MILLIS: i64 = 20_000;
const ROOM_RETENTION_MILLIS: i64 = 24 * 60 * 60 * 1_000;

#[derive(Clone)]
struct AppState {
    database: Arc<Mutex<Connection>>,
    limiter: Arc<Mutex<HashMap<String, VecDeque<Instant>>>>,
}

#[derive(Debug)]
struct AppError {
    status: StatusCode,
    message: String,
}

impl AppError {
    fn new(status: StatusCode, message: impl Into<String>) -> Self {
        Self {
            status,
            message: message.into(),
        }
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        (
            self.status,
            Json(serde_json::json!({ "error": self.message })),
        )
            .into_response()
    }
}

impl From<rusqlite::Error> for AppError {
    fn from(error: rusqlite::Error) -> Self {
        tracing::error!(error = %error, "database request failed");
        AppError::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "The room service could not save this request.",
        )
    }
}

impl From<serde_json::Error> for AppError {
    fn from(error: serde_json::Error) -> Self {
        tracing::error!(error = %error, "room state encoding failed");
        AppError::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "The room service could not encode this request.",
        )
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
enum Player {
    A,
    B,
}

impl Player {
    fn other(self) -> Self {
        match self {
            Player::A => Player::B,
            Player::B => Player::A,
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
enum CraftId {
    Echo,
    Kilo,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
enum Direction {
    N,
    E,
    S,
    W,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
enum Action {
    Advance,
    Left,
    Right,
    Pulse,
    Sonar,
    Hold,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
struct Command {
    craft: CraftId,
    action: Action,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Craft {
    id: CraftId,
    x: i32,
    y: i32,
    facing: Direction,
    integrity: u8,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
enum ContactKind {
    Sonar,
    Wake,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Contact {
    x: i32,
    y: i32,
    kind: ContactKind,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct GameState {
    seed: String,
    round: u8,
    current: Direction,
    crafts_a: Vec<Craft>,
    crafts_b: Vec<Craft>,
    contacts_a: Vec<Contact>,
    contacts_b: Vec<Contact>,
    last_log: Vec<String>,
    winner: Option<Player>,
    draw: bool,
}

#[derive(Debug)]
struct RoomRow {
    code: String,
    phase: String,
    deadline_ms: Option<i64>,
    token_a_hash: Option<String>,
    token_b_hash: Option<String>,
    commands_a: Option<String>,
    commands_b: Option<String>,
    final_seen_a: bool,
    final_seen_b: bool,
    state: GameState,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct IntegrityView {
    id: CraftId,
    integrity: u8,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RoomView {
    code: String,
    player: Player,
    phase: String,
    round: u8,
    current: Direction,
    deadline_ms: Option<i64>,
    own: Vec<Craft>,
    contacts: Vec<Contact>,
    opponent_integrity: Vec<IntegrityView>,
    queue_locked: bool,
    result: Option<String>,
    last_log: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct JoinResponse {
    code: String,
    token: String,
    view: RoomView,
}

#[derive(Deserialize)]
struct SubmitCommands {
    round: u8,
    commands: Vec<Command>,
}

pub fn default_database_path() -> PathBuf {
    if let Ok(path) = std::env::var("SIGNAL_SALVO_DB") {
        return PathBuf::from(path);
    }
    if Path::new("/data").is_dir() {
        PathBuf::from("/data/signal-salvo.sqlite")
    } else {
        PathBuf::from("signal-salvo.sqlite")
    }
}

pub fn app_with_path(path: &Path) -> Result<Router, rusqlite::Error> {
    if let Some(parent) = path.parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent)
                .map_err(|_| rusqlite::Error::InvalidPath(path.into()))?;
        }
    }
    // An existing database may live on an Azure Files mount whose lease is
    // still settling while Container Apps swaps revisions. Opening the file is
    // safe, but even a schema read can make SQLite attempt hot-journal recovery
    // and fail the whole process with SQLITE_BUSY. The schema is immutable for
    // this release, so only initialize a new file and let normal requests use
    // the existing one after startup.
    let database_exists = path.metadata().is_ok_and(|metadata| metadata.len() > 0);
    // Azure Files does not provide SQLite's usual POSIX advisory-lock
    // semantics. The dot-file VFS coordinates access with atomic filesystem
    // entries instead; the deployment is also fixed at one replica.
    let connection =
        Connection::open_with_flags_and_vfs(path, OpenFlags::default(), "unix-dotfile")?;
    connection.busy_timeout(Duration::from_secs(5))?;
    if !database_exists {
        connection.execute_batch(
            "CREATE TABLE rooms (
           code TEXT PRIMARY KEY,
           phase TEXT NOT NULL,
           deadline_ms INTEGER,
           token_a_hash TEXT,
           token_b_hash TEXT,
           commands_a TEXT,
           commands_b TEXT,
           final_seen_a INTEGER NOT NULL DEFAULT 0,
           final_seen_b INTEGER NOT NULL DEFAULT 0,
           state_json TEXT NOT NULL,
           created_at_ms INTEGER NOT NULL,
           updated_at_ms INTEGER NOT NULL
         );
         CREATE INDEX rooms_updated_idx ON rooms(updated_at_ms);",
        )?;
    }
    let state = Arc::new(AppState {
        database: Arc::new(Mutex::new(connection)),
        limiter: Arc::new(Mutex::new(HashMap::new())),
    });

    let allowed_origins = [
        HeaderValue::from_static("https://signal-salvo.sociobot.in"),
        HeaderValue::from_static("http://127.0.0.1:4173"),
        HeaderValue::from_static("http://localhost:4173"),
        HeaderValue::from_static("http://127.0.0.1:5173"),
        HeaderValue::from_static("http://localhost:5173"),
    ];
    let cors = CorsLayer::new()
        .allow_origin(AllowOrigin::list(allowed_origins))
        .allow_methods([Method::GET, Method::POST, Method::OPTIONS])
        .allow_headers([
            header::CONTENT_TYPE,
            header::ACCEPT,
            HeaderName::from_static("x-player-token"),
        ]);

    Ok(Router::new()
        .route("/health", get(health))
        .route("/api/rooms", post(create_room))
        .route("/api/rooms/{code}", get(get_room))
        .route("/api/rooms/{code}/join", post(join_room))
        .route("/api/rooms/{code}/commands", post(submit_commands))
        .fallback(not_found)
        .layer(middleware::from_fn_with_state(state.clone(), rate_limit))
        .layer(cors)
        .layer(middleware::from_fn(security_headers))
        .layer(TraceLayer::new_for_http())
        .with_state(state))
}

async fn health() -> impl IntoResponse {
    Json(serde_json::json!({ "ok": true, "buildSha": BUILD_SHA }))
}

async fn not_found() -> AppError {
    AppError::new(
        StatusCode::NOT_FOUND,
        "This room-service route does not exist.",
    )
}

async fn security_headers(request: Request<Body>, next: Next) -> Response {
    let mut response = next.run(request).await;
    let headers = response.headers_mut();
    headers.insert(
        header::X_CONTENT_TYPE_OPTIONS,
        HeaderValue::from_static("nosniff"),
    );
    headers.insert(
        header::REFERRER_POLICY,
        HeaderValue::from_static("no-referrer"),
    );
    headers.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    response
}

async fn rate_limit(
    State(state): State<Arc<AppState>>,
    request: Request<Body>,
    next: Next,
) -> Response {
    if request.uri().path() == "/health" {
        return next.run(request).await;
    }
    let client = request
        .headers()
        .get("x-forwarded-for")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.split(',').next())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("unknown")
        .to_string();
    let now = Instant::now();
    let mut limiter = state.limiter.lock().await;
    let requests = limiter.entry(client).or_default();
    while requests
        .front()
        .is_some_and(|timestamp| now.duration_since(*timestamp) >= Duration::from_secs(10))
    {
        requests.pop_front();
    }
    if requests.len() >= 40 {
        drop(limiter);
        let mut response = AppError::new(
            StatusCode::TOO_MANY_REQUESTS,
            "Too many room requests. Wait 10 seconds and try again.",
        )
        .into_response();
        response
            .headers_mut()
            .insert(header::RETRY_AFTER, HeaderValue::from_static("10"));
        return response;
    }
    requests.push_back(now);
    drop(limiter);
    next.run(request).await
}

async fn create_room(State(state): State<Arc<AppState>>) -> Result<Json<JoinResponse>, AppError> {
    let connection = state.database.lock().await;
    let now = now_ms();
    connection.execute(
        "DELETE FROM rooms WHERE updated_at_ms < ?1",
        [now - ROOM_RETENTION_MILLIS],
    )?;
    let token = random_token();
    let token_hash = hash_token(&token);
    let mut code = random_code();
    for _ in 0..10 {
        if !room_exists(&connection, &code)? {
            break;
        }
        code = random_code();
    }
    if room_exists(&connection, &code)? {
        return Err(AppError::new(
            StatusCode::SERVICE_UNAVAILABLE,
            "A room code could not be allocated. Try again.",
        ));
    }
    let game = initial_game(format!("{}-{now}", code));
    connection.execute(
        "INSERT INTO rooms
         (code, phase, deadline_ms, token_a_hash, state_json, created_at_ms, updated_at_ms)
         VALUES (?1, 'waiting', NULL, ?2, ?3, ?4, ?4)",
        params![code, token_hash, serde_json::to_string(&game)?, now],
    )?;
    let row = load_room(&connection, &code)?.expect("created room missing");
    let view = build_view(&row, Player::A);
    Ok(Json(JoinResponse { code, token, view }))
}

async fn join_room(
    State(state): State<Arc<AppState>>,
    AxumPath(code): AxumPath<String>,
) -> Result<Json<JoinResponse>, AppError> {
    let code = normalize_code(code)?;
    let connection = state.database.lock().await;
    let row = load_room(&connection, &code)?
        .ok_or_else(|| AppError::new(StatusCode::NOT_FOUND, "That room code was not found."))?;
    if row.phase != "waiting" || row.token_b_hash.is_some() {
        return Err(AppError::new(
            StatusCode::CONFLICT,
            "That room already has two players.",
        ));
    }
    let token = random_token();
    let deadline = now_ms() + ROUND_MILLIS;
    connection.execute(
        "UPDATE rooms SET phase='planning', token_b_hash=?2, deadline_ms=?3, updated_at_ms=?4 WHERE code=?1",
        params![code, hash_token(&token), deadline, now_ms()],
    )?;
    let updated = load_room(&connection, &code)?.expect("joined room missing");
    let view = build_view(&updated, Player::B);
    Ok(Json(JoinResponse { code, token, view }))
}

async fn get_room(
    State(state): State<Arc<AppState>>,
    AxumPath(code): AxumPath<String>,
    headers: HeaderMap,
) -> Result<Json<RoomView>, AppError> {
    let code = normalize_code(code)?;
    let token = player_token(&headers)?;
    let connection = state.database.lock().await;
    let mut row = load_room(&connection, &code)?
        .ok_or_else(|| AppError::new(StatusCode::NOT_FOUND, "That room code was not found."))?;
    let player = authenticate(&row, &token)?;
    if row.phase == "finished"
        && match player {
            Player::A => row.final_seen_a,
            Player::B => row.final_seen_b,
        }
    {
        return Err(AppError::new(
            StatusCode::GONE,
            "This reconnect token expired when the match ended.",
        ));
    }
    if row.phase == "planning" && row.deadline_ms.is_some_and(|deadline| deadline <= now_ms()) {
        resolve_stored_round(&connection, &mut row)?;
        row = load_room(&connection, &code)?.expect("resolved room missing");
    }
    let view = build_view(&row, player);
    if row.phase == "finished" {
        expire_player_token(&connection, &code, player)?;
    }
    Ok(Json(view))
}

async fn submit_commands(
    State(state): State<Arc<AppState>>,
    AxumPath(code): AxumPath<String>,
    headers: HeaderMap,
    Json(input): Json<SubmitCommands>,
) -> Result<Json<RoomView>, AppError> {
    let code = normalize_code(code)?;
    if input.commands.len() != PLAN_SIZE {
        return Err(AppError::new(
            StatusCode::UNPROCESSABLE_ENTITY,
            "Queue exactly three commands.",
        ));
    }
    let token = player_token(&headers)?;
    let connection = state.database.lock().await;
    let mut row = load_room(&connection, &code)?
        .ok_or_else(|| AppError::new(StatusCode::NOT_FOUND, "That room code was not found."))?;
    let player = authenticate(&row, &token)?;
    if row.phase == "planning" && row.deadline_ms.is_some_and(|deadline| deadline <= now_ms()) {
        resolve_stored_round(&connection, &mut row)?;
        return Err(AppError::new(
            StatusCode::CONFLICT,
            "This round ended before the plan arrived. Review the new board and queue another plan.",
        ));
    }
    if input.round != row.state.round {
        return Err(AppError::new(
            StatusCode::CONFLICT,
            "The board advanced before this plan arrived. Review the new round and queue another plan.",
        ));
    }
    if row.phase != "planning" {
        return Err(AppError::new(
            StatusCode::CONFLICT,
            "This room is not accepting a plan.",
        ));
    }
    let already_locked = match player {
        Player::A => row.commands_a.is_some(),
        Player::B => row.commands_b.is_some(),
    };
    if already_locked {
        return Err(AppError::new(
            StatusCode::CONFLICT,
            "Your plan is already locked for this round.",
        ));
    }
    let encoded = serde_json::to_string(&input.commands)?;
    match player {
        Player::A => connection.execute(
            "UPDATE rooms SET commands_a=?2, updated_at_ms=?3 WHERE code=?1",
            params![code, encoded, now_ms()],
        )?,
        Player::B => connection.execute(
            "UPDATE rooms SET commands_b=?2, updated_at_ms=?3 WHERE code=?1",
            params![code, encoded, now_ms()],
        )?,
    };
    row = load_room(&connection, &code)?.expect("submitted room missing");
    if row.commands_a.is_some() && row.commands_b.is_some() {
        resolve_stored_round(&connection, &mut row)?;
        row = load_room(&connection, &code)?.expect("resolved room missing");
    }
    let view = build_view(&row, player);
    if row.phase == "finished" {
        expire_player_token(&connection, &code, player)?;
    }
    Ok(Json(view))
}

fn normalize_code(code: String) -> Result<String, AppError> {
    let normalized = code.trim().to_ascii_uppercase();
    if normalized.len() != 5
        || !normalized
            .chars()
            .all(|character| character.is_ascii_uppercase())
    {
        return Err(AppError::new(
            StatusCode::BAD_REQUEST,
            "A room code must contain exactly five letters.",
        ));
    }
    Ok(normalized)
}

fn player_token(headers: &HeaderMap) -> Result<String, AppError> {
    headers
        .get("x-player-token")
        .and_then(|value| value.to_str().ok())
        .filter(|value| value.len() >= 32)
        .map(str::to_owned)
        .ok_or_else(|| AppError::new(StatusCode::UNAUTHORIZED, "A valid room token is required."))
}

fn authenticate(row: &RoomRow, token: &str) -> Result<Player, AppError> {
    let candidate = hash_token(token);
    if row.token_a_hash.as_deref() == Some(candidate.as_str()) {
        return Ok(Player::A);
    }
    if row.token_b_hash.as_deref() == Some(candidate.as_str()) {
        return Ok(Player::B);
    }
    if row.phase == "finished" {
        return Err(AppError::new(
            StatusCode::GONE,
            "This reconnect token expired when the match ended.",
        ));
    }
    Err(AppError::new(
        StatusCode::UNAUTHORIZED,
        "The room token is invalid.",
    ))
}

fn expire_player_token(
    connection: &Connection,
    code: &str,
    player: Player,
) -> Result<(), rusqlite::Error> {
    match player {
        Player::A => connection.execute(
            "UPDATE rooms SET final_seen_a=1, token_a_hash=NULL, updated_at_ms=?2 WHERE code=?1",
            params![code, now_ms()],
        )?,
        Player::B => connection.execute(
            "UPDATE rooms SET final_seen_b=1, token_b_hash=NULL, updated_at_ms=?2 WHERE code=?1",
            params![code, now_ms()],
        )?,
    };
    Ok(())
}

fn resolve_stored_round(connection: &Connection, row: &mut RoomRow) -> Result<(), AppError> {
    let plan_a = parse_plan(row.commands_a.as_deref())?;
    let plan_b = parse_plan(row.commands_b.as_deref())?;
    row.state = resolve_round(&row.state, &plan_a, &plan_b);
    let finished = row.state.winner.is_some() || row.state.draw;
    let phase = if finished { "finished" } else { "planning" };
    let deadline = if finished {
        None
    } else {
        Some(now_ms() + ROUND_MILLIS)
    };
    connection.execute(
        "UPDATE rooms SET phase=?2, deadline_ms=?3, commands_a=NULL, commands_b=NULL, state_json=?4, updated_at_ms=?5 WHERE code=?1",
        params![
            row.code,
            phase,
            deadline,
            serde_json::to_string(&row.state)?,
            now_ms()
        ],
    )?;
    Ok(())
}

fn parse_plan(value: Option<&str>) -> Result<Vec<Command>, AppError> {
    match value {
        Some(encoded) => serde_json::from_str(encoded).map_err(|_| {
            AppError::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "A saved plan could not be resolved.",
            )
        }),
        None => Ok(vec![
            Command {
                craft: CraftId::Echo,
                action: Action::Hold,
            },
            Command {
                craft: CraftId::Kilo,
                action: Action::Hold,
            },
            Command {
                craft: CraftId::Echo,
                action: Action::Hold,
            },
        ]),
    }
}

fn build_view(row: &RoomRow, player: Player) -> RoomView {
    let (own, contacts, opponent_crafts, queue_locked) = match player {
        Player::A => (
            row.state.crafts_a.clone(),
            row.state.contacts_a.clone(),
            row.state.crafts_b.clone(),
            row.commands_a.is_some(),
        ),
        Player::B => (
            row.state.crafts_b.clone(),
            row.state.contacts_b.clone(),
            row.state.crafts_a.clone(),
            row.commands_b.is_some(),
        ),
    };
    let result = if row.phase != "finished" {
        None
    } else if row.state.draw {
        Some("draw".to_string())
    } else if row.state.winner == Some(player) {
        Some("win".to_string())
    } else {
        Some("loss".to_string())
    };
    RoomView {
        code: row.code.clone(),
        player,
        phase: row.phase.clone(),
        round: row.state.round,
        current: row.state.current,
        deadline_ms: row.deadline_ms,
        own,
        contacts,
        opponent_integrity: opponent_crafts
            .into_iter()
            .map(|craft| IntegrityView {
                id: craft.id,
                integrity: craft.integrity,
            })
            .collect(),
        queue_locked,
        result,
        last_log: row.state.last_log.clone(),
    }
}

fn load_room(connection: &Connection, code: &str) -> Result<Option<RoomRow>, AppError> {
    connection
        .query_row(
            "SELECT code, phase, deadline_ms, token_a_hash, token_b_hash, commands_a, commands_b, final_seen_a, final_seen_b, state_json
             FROM rooms WHERE code=?1",
            [code],
            |row| {
                let encoded: String = row.get(9)?;
                let state = serde_json::from_str(&encoded).map_err(|error| {
                    rusqlite::Error::FromSqlConversionFailure(
                        9,
                        rusqlite::types::Type::Text,
                        Box::new(error),
                    )
                })?;
                Ok(RoomRow {
                    code: row.get(0)?,
                    phase: row.get(1)?,
                    deadline_ms: row.get(2)?,
                    token_a_hash: row.get(3)?,
                    token_b_hash: row.get(4)?,
                    commands_a: row.get(5)?,
                    commands_b: row.get(6)?,
                    final_seen_a: row.get::<_, i64>(7)? != 0,
                    final_seen_b: row.get::<_, i64>(8)? != 0,
                    state,
                })
            },
        )
        .optional()
        .map_err(AppError::from)
}

fn room_exists(connection: &Connection, code: &str) -> Result<bool, rusqlite::Error> {
    connection.query_row(
        "SELECT EXISTS(SELECT 1 FROM rooms WHERE code=?1)",
        [code],
        |row| row.get(0),
    )
}

fn random_code() -> String {
    const LETTERS: &[u8] = b"ABCDEFGHJKLMNPQRSTUVWXYZ";
    let mut rng = OsRng;
    (0..5)
        .map(|_| LETTERS[rng.gen_range(0..LETTERS.len())] as char)
        .collect()
}

fn random_token() -> String {
    let mut bytes = [0_u8; 32];
    OsRng.fill_bytes(&mut bytes);
    hex::encode(bytes)
}

fn hash_token(token: &str) -> String {
    hex::encode(Sha256::digest(token.as_bytes()))
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

fn initial_game(seed: String) -> GameState {
    GameState {
        current: current_for(&seed, 1),
        seed,
        round: 1,
        crafts_a: vec![
            Craft {
                id: CraftId::Echo,
                x: 1,
                y: 2,
                facing: Direction::E,
                integrity: 2,
            },
            Craft {
                id: CraftId::Kilo,
                x: 1,
                y: 5,
                facing: Direction::E,
                integrity: 2,
            },
        ],
        crafts_b: vec![
            Craft {
                id: CraftId::Echo,
                x: 6,
                y: 2,
                facing: Direction::W,
                integrity: 2,
            },
            Craft {
                id: CraftId::Kilo,
                x: 6,
                y: 5,
                facing: Direction::W,
                integrity: 2,
            },
        ],
        contacts_a: vec![],
        contacts_b: vec![],
        last_log: vec!["Round 1 is ready. Queue three commands.".into()],
        winner: None,
        draw: false,
    }
}

fn current_for(seed: &str, round: u8) -> Direction {
    let mut hash: u32 = 2_166_136_261;
    for byte in seed.as_bytes() {
        hash ^= *byte as u32;
        hash = hash.wrapping_mul(16_777_619);
    }
    match hash.wrapping_add(round as u32 * 3) % 4 {
        0 => Direction::N,
        1 => Direction::E,
        2 => Direction::S,
        _ => Direction::W,
    }
}

fn vector(direction: Direction) -> (i32, i32) {
    match direction {
        Direction::N => (0, -1),
        Direction::E => (1, 0),
        Direction::S => (0, 1),
        Direction::W => (-1, 0),
    }
}

fn rotate(direction: Direction, right: bool) -> Direction {
    match (direction, right) {
        (Direction::N, true) | (Direction::S, false) => Direction::E,
        (Direction::E, true) | (Direction::W, false) => Direction::S,
        (Direction::S, true) | (Direction::N, false) => Direction::W,
        (Direction::W, true) | (Direction::E, false) => Direction::N,
    }
}

fn inside(x: i32, y: i32) -> bool {
    (0..BOARD_WIDTH).contains(&x) && (0..BOARD_HEIGHT).contains(&y)
}

fn crafts(state: &GameState, player: Player) -> &Vec<Craft> {
    match player {
        Player::A => &state.crafts_a,
        Player::B => &state.crafts_b,
    }
}

fn crafts_mut(state: &mut GameState, player: Player) -> &mut Vec<Craft> {
    match player {
        Player::A => &mut state.crafts_a,
        Player::B => &mut state.crafts_b,
    }
}

fn contacts_mut(state: &mut GameState, player: Player) -> &mut Vec<Contact> {
    match player {
        Player::A => &mut state.contacts_a,
        Player::B => &mut state.contacts_b,
    }
}

fn command_for(plan: &[Command], step: usize) -> &Command {
    &plan[step]
}

fn resolve_round(previous: &GameState, plan_a: &[Command], plan_b: &[Command]) -> GameState {
    let mut state = previous.clone();
    state.contacts_a.clear();
    state.contacts_b.clear();
    let mut log = vec![format!("Round {} plans revealed.", state.round)];

    for step in 0..PLAN_SIZE {
        for (player, plan) in [(Player::A, plan_a), (Player::B, plan_b)] {
            let command = command_for(plan, step);
            if let Some(craft) = crafts_mut(&mut state, player)
                .iter_mut()
                .find(|craft| craft.id == command.craft && craft.integrity > 0)
            {
                match command.action {
                    Action::Left => {
                        craft.facing = rotate(craft.facing, false);
                        log.push(format!("{:?} {:?} turned left.", player, craft.id));
                    }
                    Action::Right => {
                        craft.facing = rotate(craft.facing, true);
                        log.push(format!("{:?} {:?} turned right.", player, craft.id));
                    }
                    Action::Hold => log.push(format!("{:?} {:?} held position.", player, craft.id)),
                    _ => {}
                }
            }
        }

        let snapshot = state.clone();
        let mut proposals = Vec::new();
        for (player, plan) in [(Player::A, plan_a), (Player::B, plan_b)] {
            let command = command_for(plan, step);
            if command.action != Action::Advance {
                continue;
            }
            if let Some(craft) = crafts(&snapshot, player)
                .iter()
                .find(|craft| craft.id == command.craft && craft.integrity > 0)
            {
                let (dx, dy) = vector(craft.facing);
                proposals.push((
                    player,
                    craft.id,
                    craft.x,
                    craft.y,
                    craft.x + dx,
                    craft.y + dy,
                ));
            }
        }
        for (player, id, old_x, old_y, x, y) in proposals.clone() {
            let occupied = crafts(&snapshot, Player::A)
                .iter()
                .chain(crafts(&snapshot, Player::B))
                .any(|craft| craft.integrity > 0 && craft.x == x && craft.y == y);
            let duplicate = proposals
                .iter()
                .filter(|proposal| proposal.4 == x && proposal.5 == y)
                .count()
                > 1;
            if inside(x, y) && !occupied && !duplicate {
                if let Some(craft) = crafts_mut(&mut state, player)
                    .iter_mut()
                    .find(|craft| craft.id == id)
                {
                    craft.x = x;
                    craft.y = y;
                }
                contacts_mut(&mut state, player.other()).push(Contact {
                    x: old_x,
                    y: old_y,
                    kind: ContactKind::Wake,
                });
                log.push(format!("{:?} {:?} advanced.", player, id));
            } else {
                log.push(format!("{:?} {:?} could not advance.", player, id));
            }
        }

        let pulse_snapshot = state.clone();
        let mut hits: Vec<(Player, CraftId)> = vec![];
        for (player, plan) in [(Player::A, plan_a), (Player::B, plan_b)] {
            let command = command_for(plan, step);
            let source = crafts(&pulse_snapshot, player)
                .iter()
                .find(|craft| craft.id == command.craft && craft.integrity > 0);
            let Some(source) = source else { continue };
            if command.action == Action::Pulse {
                let (dx, dy) = vector(source.facing);
                let target = (1..=3).find_map(|distance| {
                    crafts(&pulse_snapshot, player.other())
                        .iter()
                        .find(|target| {
                            target.integrity > 0
                                && target.x == source.x + dx * distance
                                && target.y == source.y + dy * distance
                        })
                        .map(|target| target.id)
                });
                if let Some(target) = target {
                    hits.push((player.other(), target));
                    log.push(format!(
                        "{:?} {:?} connected a pulse with {:?} {:?}.",
                        player,
                        source.id,
                        player.other(),
                        target
                    ));
                } else {
                    log.push(format!(
                        "{:?} {:?} sent a pulse with no contact.",
                        player, source.id
                    ));
                }
            }
            if command.action == Action::Sonar {
                let found: Vec<Contact> = crafts(&pulse_snapshot, player.other())
                    .iter()
                    .filter(|target| {
                        target.integrity > 0
                            && (target.x - source.x).abs() + (target.y - source.y).abs() <= 3
                    })
                    .map(|target| Contact {
                        x: target.x,
                        y: target.y,
                        kind: ContactKind::Sonar,
                    })
                    .collect();
                log.push(format!(
                    "{:?} {:?} found {} sonar contact{}.",
                    player,
                    source.id,
                    found.len(),
                    if found.len() == 1 { "" } else { "s" }
                ));
                contacts_mut(&mut state, player).extend(found);
            }
        }
        for (player, id) in hits {
            if let Some(target) = crafts_mut(&mut state, player)
                .iter_mut()
                .find(|craft| craft.id == id)
            {
                target.integrity = target.integrity.saturating_sub(1);
            }
        }
    }

    apply_current(&mut state, &mut log);
    state.contacts_a = unique_contacts(std::mem::take(&mut state.contacts_a));
    state.contacts_b = unique_contacts(std::mem::take(&mut state.contacts_b));
    let integrity_a: u8 = state.crafts_a.iter().map(|craft| craft.integrity).sum();
    let integrity_b: u8 = state.crafts_b.iter().map(|craft| craft.integrity).sum();
    if integrity_a == 0 || integrity_b == 0 || state.round >= MAX_ROUNDS {
        if integrity_a == integrity_b {
            state.draw = true;
            log.push("The match ended in a draw.".into());
        } else {
            let winner = if integrity_a > integrity_b {
                Player::A
            } else {
                Player::B
            };
            state.winner = Some(winner);
            log.push(format!("Player {:?} won the match.", winner));
        }
    } else {
        state.round += 1;
        state.current = current_for(&state.seed, state.round);
        log.push(format!("Round {} is ready.", state.round));
    }
    state.last_log = log;
    state
}

fn apply_current(state: &mut GameState, log: &mut Vec<String>) {
    let (dx, dy) = vector(state.current);
    let snapshot = state.clone();
    let proposals: Vec<(Player, CraftId, i32, i32, i32, i32)> = [Player::A, Player::B]
        .into_iter()
        .flat_map(|player| {
            crafts(&snapshot, player)
                .iter()
                .filter(|craft| craft.integrity > 0)
                .map(move |craft| {
                    (
                        player,
                        craft.id,
                        craft.x,
                        craft.y,
                        craft.x + dx,
                        craft.y + dy,
                    )
                })
        })
        .collect();
    let mut moved = 0;
    for (player, id, old_x, old_y, x, y) in proposals.clone() {
        if !inside(x, y) {
            continue;
        }
        let duplicate_target = proposals
            .iter()
            .filter(|proposal| proposal.4 == x && proposal.5 == y)
            .count()
            > 1;
        let occupied = snapshot
            .crafts_a
            .iter()
            .chain(snapshot.crafts_b.iter())
            .any(|craft| craft.integrity > 0 && craft.x == x && craft.y == y);
        let target_will_leave = proposals
            .iter()
            .any(|proposal| proposal.2 == x && proposal.3 == y && inside(proposal.4, proposal.5));
        if duplicate_target || (occupied && !target_will_leave) {
            continue;
        }
        if let Some(craft) = crafts_mut(state, player)
            .iter_mut()
            .find(|craft| craft.id == id)
        {
            craft.x = x;
            craft.y = y;
        }
        contacts_mut(state, player.other()).push(Contact {
            x: old_x,
            y: old_y,
            kind: ContactKind::Wake,
        });
        moved += 1;
    }
    log.push(format!(
        "The {:?} current shifted {} craft.",
        state.current, moved
    ));
}

fn unique_contacts(contacts: Vec<Contact>) -> Vec<Contact> {
    let mut unique: HashMap<(i32, i32, &'static str), Contact> = HashMap::new();
    for contact in contacts {
        let kind = match contact.kind {
            ContactKind::Sonar => "sonar",
            ContactKind::Wake => "wake",
        };
        unique.insert((contact.x, contact.y, kind), contact);
    }
    unique.into_values().collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{body::to_bytes, http::Request};
    use tower::ServiceExt;

    async fn create_test_room(app: &Router) -> serde_json::Value {
        let response = app
            .clone()
            .oneshot(Request::post("/api/rooms").body(Body::empty()).unwrap())
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        serde_json::from_slice(&body).unwrap()
    }

    async fn join_test_room(app: &Router, code: &str) -> serde_json::Value {
        let response = app
            .clone()
            .oneshot(
                Request::post(format!("/api/rooms/{code}/join"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        serde_json::from_slice(&body).unwrap()
    }

    fn plan(round: u8, player: Player) -> Vec<Command> {
        if round == 1 {
            vec![
                Command {
                    craft: CraftId::Echo,
                    action: Action::Advance,
                },
                Command {
                    craft: CraftId::Kilo,
                    action: Action::Advance,
                },
                Command {
                    craft: CraftId::Echo,
                    action: Action::Sonar,
                },
            ]
        } else if player == Player::A {
            vec![
                Command {
                    craft: CraftId::Echo,
                    action: Action::Pulse,
                },
                Command {
                    craft: CraftId::Kilo,
                    action: Action::Pulse,
                },
                Command {
                    craft: CraftId::Echo,
                    action: Action::Sonar,
                },
            ]
        } else {
            vec![
                Command {
                    craft: CraftId::Echo,
                    action: Action::Pulse,
                },
                Command {
                    craft: CraftId::Kilo,
                    action: Action::Hold,
                },
                Command {
                    craft: CraftId::Echo,
                    action: Action::Sonar,
                },
            ]
        }
    }

    #[test]
    fn deterministic_engine_reaches_an_end() {
        let mut game = initial_game("SALVO-DEMO-17".into());
        while game.winner.is_none() && !game.draw {
            game = resolve_round(
                &game,
                &plan(game.round, Player::A),
                &plan(game.round, Player::B),
            );
        }
        assert!(game.round <= MAX_ROUNDS);
        assert!(game.winner.is_some() || game.draw);
    }

    #[tokio::test]
    async fn room_survives_a_database_reopen() {
        let temporary = tempfile::tempdir().unwrap();
        let path = temporary.path().join("rooms.sqlite");
        let app = app_with_path(&path).unwrap();
        let response = app
            .clone()
            .oneshot(Request::post("/api/rooms").body(Body::empty()).unwrap())
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        let created: serde_json::Value = serde_json::from_slice(&body).unwrap();
        let code = created["code"].as_str().unwrap();
        let token_a = created["token"].as_str().unwrap();
        let joined = join_test_room(&app, code).await;
        let token_b = joined["token"].as_str().unwrap();
        let locked_plan = serde_json::json!({ "round": 1, "commands": plan(1, Player::A) });
        let response = app
            .clone()
            .oneshot(
                Request::post(format!("/api/rooms/{code}/commands"))
                    .header(header::CONTENT_TYPE, "application/json")
                    .header("x-player-token", token_a)
                    .body(Body::from(locked_plan.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);

        let reopened = app_with_path(&path).unwrap();
        let response = reopened
            .clone()
            .oneshot(
                Request::get(format!("/api/rooms/{code}"))
                    .header("x-player-token", token_a)
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        let restored: serde_json::Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(restored["round"], 1);
        assert_eq!(restored["queueLocked"], true);

        let completing_plan = serde_json::json!({ "round": 1, "commands": plan(1, Player::B) });
        let response = reopened
            .oneshot(
                Request::post(format!("/api/rooms/{code}/commands"))
                    .header(header::CONTENT_TYPE, "application/json")
                    .header("x-player-token", token_b)
                    .body(Body::from(completing_plan.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        let resolved: serde_json::Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(resolved["round"], 2);
    }

    #[test]
    fn startup_reuses_an_existing_schema_while_a_reader_is_active() {
        let temporary = tempfile::tempdir().unwrap();
        let path = temporary.path().join("rooms.sqlite");
        let initialized = app_with_path(&path).unwrap();
        drop(initialized);
        let reader = Connection::open(&path).unwrap();
        reader
            .execute_batch("BEGIN; SELECT COUNT(*) FROM rooms;")
            .unwrap();

        let reopened = app_with_path(&path);

        assert!(reopened.is_ok());
        reader.execute_batch("ROLLBACK;").unwrap();
    }

    #[test]
    fn current_moves_adjacent_craft_as_one_line() {
        let mut game = initial_game("current-line".into());
        game.current = Direction::E;
        game.crafts_a[0].x = 1;
        game.crafts_a[0].y = 3;
        game.crafts_a[1].x = 2;
        game.crafts_a[1].y = 3;
        game.crafts_b[0].x = 3;
        game.crafts_b[0].y = 3;
        game.crafts_b[1].x = 4;
        game.crafts_b[1].y = 3;
        let mut log = vec![];

        apply_current(&mut game, &mut log);

        assert_eq!(game.crafts_a[0].x, 2);
        assert_eq!(game.crafts_a[1].x, 3);
        assert_eq!(game.crafts_b[0].x, 4);
        assert_eq!(game.crafts_b[1].x, 5);
        assert!(log.iter().any(|line| line.contains("shifted 4 craft")));
    }

    #[tokio::test]
    async fn health_reports_the_running_build() {
        let temporary = tempfile::tempdir().unwrap();
        let app = app_with_path(&temporary.path().join("rooms.sqlite")).unwrap();
        let response = app
            .oneshot(Request::get("/health").body(Body::empty()).unwrap())
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        let health: serde_json::Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(health["ok"], true);
        assert_eq!(health["buildSha"], BUILD_SHA);
    }

    #[tokio::test]
    async fn room_tokens_are_hashed_and_cannot_cross_rooms() {
        let temporary = tempfile::tempdir().unwrap();
        let path = temporary.path().join("rooms.sqlite");
        let app = app_with_path(&path).unwrap();
        let first = create_test_room(&app).await;
        let second = create_test_room(&app).await;
        let first_token = first["token"].as_str().unwrap();
        let first_code = first["code"].as_str().unwrap();
        let second_code = second["code"].as_str().unwrap();

        let connection = Connection::open(&path).unwrap();
        let stored_hash: String = connection
            .query_row(
                "SELECT token_a_hash FROM rooms WHERE code=?1",
                [first_code],
                |row| row.get(0),
            )
            .unwrap();
        assert_ne!(stored_hash, first_token);
        assert_eq!(stored_hash, hash_token(first_token));

        let response = app
            .oneshot(
                Request::get(format!("/api/rooms/{second_code}"))
                    .header("x-player-token", first_token)
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn a_plan_arriving_after_the_deadline_cannot_change_the_finished_round() {
        let temporary = tempfile::tempdir().unwrap();
        let path = temporary.path().join("rooms.sqlite");
        let app = app_with_path(&path).unwrap();
        let created = create_test_room(&app).await;
        let code = created["code"].as_str().unwrap();
        let token = created["token"].as_str().unwrap();
        join_test_room(&app, code).await;

        Connection::open(&path)
            .unwrap()
            .execute("UPDATE rooms SET deadline_ms=0 WHERE code=?1", [code])
            .unwrap();
        let late_plan = serde_json::json!({
            "round": 1,
            "commands": [
                {"craft": "Echo", "action": "pulse"},
                {"craft": "Kilo", "action": "pulse"},
                {"craft": "Echo", "action": "sonar"}
            ]
        });
        let response = app
            .clone()
            .oneshot(
                Request::post(format!("/api/rooms/{code}/commands"))
                    .header(header::CONTENT_TYPE, "application/json")
                    .header("x-player-token", token)
                    .body(Body::from(late_plan.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::CONFLICT);

        let response = app
            .clone()
            .oneshot(
                Request::get(format!("/api/rooms/{code}"))
                    .header("x-player-token", token)
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        let view: serde_json::Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(view["round"], 2);
        assert_eq!(view["opponentIntegrity"][0]["integrity"], 2);
        assert_eq!(view["opponentIntegrity"][1]["integrity"], 2);

        let stale_response = app
            .oneshot(
                Request::post(format!("/api/rooms/{code}/commands"))
                    .header(header::CONTENT_TYPE, "application/json")
                    .header("x-player-token", token)
                    .body(Body::from(late_plan.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(stale_response.status(), StatusCode::CONFLICT);
    }

    #[tokio::test]
    async fn excessive_requests_return_retry_after() {
        let temporary = tempfile::tempdir().unwrap();
        let app = app_with_path(&temporary.path().join("rooms.sqlite")).unwrap();
        let mut limited = None;
        for _ in 0..45 {
            let response = app
                .clone()
                .oneshot(
                    Request::get("/api/rooms/ABCDE")
                        .header("x-forwarded-for", "203.0.113.25")
                        .header(
                            "x-player-token",
                            "a-token-long-enough-to-pass-the-header-check",
                        )
                        .body(Body::empty())
                        .unwrap(),
                )
                .await
                .unwrap();
            if response.status() == StatusCode::TOO_MANY_REQUESTS {
                limited = Some(response);
                break;
            }
        }
        let response = limited.expect("request allowance was not enforced");
        assert_eq!(response.headers().get(header::RETRY_AFTER).unwrap(), "10");
    }
}
