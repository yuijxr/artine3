<?php
// includes/db_connect.php

$host = "localhost";
$user = "root";
$pass = ""; // change this if your MySQL has a password
$dbname = "artine";

// Create connection
$conn = new mysqli($host, $user, $pass, $dbname);

// Check connection
if ($conn->connect_error) {
    die("Connection failed: " . $conn->connect_error);
}

// Optional: set charset to UTF-8 for better compatibility
$conn->set_charset("utf8mb4");
?>
