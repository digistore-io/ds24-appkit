// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

// The app's key facts in one place.
//
// Change the name here — it appears in the sidebar, in the browser tab and on
// the home page. If you need it to differ per environment (e.g. "My App
// (Test)" in STAGING), set NEXT_PUBLIC_APP_NAME in .env instead.
// The name is a proper noun and is therefore NOT translated — unlike
// everything else the user reads (that lives in `messages/*.json`).
export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || "Your App";
