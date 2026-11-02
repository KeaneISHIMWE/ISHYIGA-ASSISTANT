<?php
header("Content-Type: application/json; charset=utf-8");
header("X-Content-Type-Options: nosniff");

function fail($code, $message)
{
    http_response_code($code);
    echo json_encode(array("ok" => false, "error" => $message));
    exit;
}

if (isset($_SERVER["REQUEST_METHOD"]) === false || $_SERVER["REQUEST_METHOD"] !== "POST") {
    fail(405, "method not allowed");
}

$configPath = dirname(__DIR__) . "/../ishyiga-assistant.config.php";
if (is_file($configPath) === false) {
    $configPath = dirname(__DIR__, 2) . "/ishyiga-assistant.config.php";
}
if (is_file($configPath) === false) {
    fail(500, "bridge is not configured");
}
require $configPath;

$key = isset($_SERVER["HTTP_X_ASSISTANT_KEY"]) ? $_SERVER["HTTP_X_ASSISTANT_KEY"] : "";
if (!defined("ASSISTANT_KEY") || ASSISTANT_KEY === "" || !hash_equals(ASSISTANT_KEY, $key)) {
    fail(401, "unauthorized");
}

$raw = file_get_contents("php://input");
$body = json_decode($raw, true);
if (is_array($body) === false) {
    fail(400, "invalid json");
}

$sql = isset($body["sql"]) ? trim((string) $body["sql"]) : "";
$params = isset($body["params"]) ? $body["params"] : array();
if ($sql === "" || is_array($params) === false) {
    fail(400, "sql and params are required");
}
if (count($params) > 80 || strlen($sql) > 8000) {
    fail(400, "query too large");
}
if (strpos($sql, ";") !== false) {
    fail(400, "multiple statements are not allowed");
}
if (!preg_match("/^(SELECT|SHOW|WITH)\b/i", $sql)) {
    fail(400, "only read queries are allowed");
}
if (preg_match("/\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|REPLACE|TRUNCATE|GRANT|REVOKE|LOAD|INTO\s+OUTFILE|INTO\s+DUMPFILE)\b/i", $sql)) {
    fail(400, "write or admin queries are not allowed");
}

$host = defined("DB_HOST") ? DB_HOST : "ishyigahigh.mysql.db";
$name = defined("DB_NAME") ? DB_NAME : "ishyigahigh";
$user = defined("DB_USER") ? DB_USER : "ishyigahigh";
$pass = defined("DB_PASS") ? DB_PASS : "";

try {
    $pdo = new PDO(
        "mysql:host=" . $host . ";dbname=" . $name . ";charset=utf8mb4",
        $user,
        $pass,
        array(
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        )
    );
    $statement = $pdo->prepare($sql);
    $statement->execute(array_values($params));
    echo json_encode(array("ok" => true, "rows" => $statement->fetchAll()));
} catch (Exception $error) {
    fail(500, "database read failed");
}
