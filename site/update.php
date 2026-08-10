<?php
// el3d — nycklad trigger för serverns datauppdatering (petrol-mönstret).
// Nyckeln ligger i ~/el3d/trigger_key.txt, UTANFÖR public_html och git.
//   ?key=…            starta uppdateringen i bakgrunden
//   ?key=…&log=1      visa slutet av update.log
// Ordinarie drift är panel-cron; detta är verifiering + extern reserv.
$base = dirname(__DIR__, 2) . '/el3d';
$keyFile = $base . '/trigger_key.txt';
if (!is_readable($keyFile)) { http_response_code(500); exit("ingen nyckelfil\n"); }
$expected = trim(file_get_contents($keyFile));
if ($expected === '' || !hash_equals($expected, $_GET['key'] ?? '')) {
    http_response_code(403);
    exit("fel nyckel\n");
}
header('Content-Type: text/plain; charset=utf-8');
if (isset($_GET['log'])) {
    $log = $base . '/update.log';
    if (!is_readable($log)) exit("ingen logg ännu\n");
    $lines = file($log);
    echo implode('', array_slice($lines, -40));
    exit;
}
if (!function_exists('shell_exec')) exit("shell_exec avstängd — använd panel-cron\n");
$cmd = 'cd ' . escapeshellarg($base) .
       ' && nohup python3 pipeline/update_daily_server.py >> update.log 2>&1 & echo startad';
echo shell_exec($cmd) ?: "kunde inte starta\n";
