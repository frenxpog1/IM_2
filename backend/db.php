<?php
$host = 'localhost';
$user = 'root';
$pass = '';
$db = 'oms';
$conn = new mysqli($host, $user, $pass, $db);
if ($conn->connect_error) {
    die('Connection failed: ' . $conn->connect_error);
}
// No closing PHP tag or whitespace after this line 