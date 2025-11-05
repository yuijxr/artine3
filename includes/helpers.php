<?php
/**
 * Common helper functions for the application.
 */

if (!function_exists('resolve_image_path')) {
    function resolve_image_path($image, $category = '') {
        if (!$image) return 'assets/img/thumbnails/noimg.png';
        if (strpos($image, 'assets/') !== false) return $image;
        $cat = strtolower($category ?? '');
        $folder = '';
        if (strpos($cat, 'shirt') !== false) {
            $folder = 'shirts/';
        } elseif (strpos($cat, 'cap') !== false) {
            $folder = 'caps/';
        } elseif (strpos($cat, 'perfume') !== false) {
            $folder = 'perfumes/';
        }
        if ($folder === '') $folder = 'shirts/';
        return 'assets/img/' . $folder . $image;
    }
}
