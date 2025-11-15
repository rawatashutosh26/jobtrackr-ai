const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
require('dotenv').config();

// --- Auth Imports ---
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const session = require('express-session');

// --- App Setup ---
const app = express();
const PORT = process.env.PORT || 5000;

// --- Middleware ---
app.use(cors({
    origin: "http://localhost:3000", // Allow the frontend to make requests
    credentials: true // Allow cookies
}));
app.use(express.json());

// --- Session Setup ---
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false, // Don't create session until something stored
    cookie: { 
        secure: false, // Set to true if using HTTPS in production
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// --- Passport Setup ---
app.use(passport.initialize());
app.use(passport.session()); // Use session to store login state

// --- Database Connection ---
const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

// --- Passport Google Strategy ---
passport.use(new GoogleStrategy(
    {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: "http://localhost:5000/auth/google/callback",
        scope: ['profile', 'email', 'https://www.googleapis.com/auth/gmail.readonly'],
        accessType: 'offline', // This is what gets us the refresh_token
        prompt: 'consent'      // This forces the consent screen every time (good for testing)
    },
    async (accessToken, refreshToken, profile, done) => {
        const { id, displayName, emails } = profile;
        const email = emails[0].value;
        console.log("--- Google Callback Info ---");
        console.log("Access Token:", accessToken.substring(0, 10) + "..."); 
        console.log("Refresh Token:", refreshToken); // This is the magic key!
        console.log("Profile Name:", displayName);
        
        if (!refreshToken) {
            console.warn("WARNING: No refresh token received. User may have already granted consent.");
        }

        try {
            // Check if user already exists
            let user = await pool.query("SELECT * FROM users WHERE google_id = $1", [id]);

            if (user.rows.length === 0) {
                // If not, create them and save the refresh token
                user = await pool.query(
                    "INSERT INTO users (google_id, username, email, refresh_token) VALUES ($1, $2, $3, $4) RETURNING *",
                    [id, displayName, email, refreshToken]
                );
                console.log("Created new user:", user.rows[0].username);
            } else {
                // If they exist, update their refresh token (it might change)
                user = await pool.query(
                    "UPDATE users SET refresh_token = $1, username = $2 WHERE google_id = $3 RETURNING *",
                    [refreshToken, displayName, id]
                );
                console.log("Updated existing user:", user.rows[0].username);
            }
            
            return done(null, user.rows[0]); // Send user to passport
        } catch (err) {
            console.error(err);
            return done(err, null);
        }
    }
));
// --- Passport Session Management ---
// Saves user ID to session
passport.serializeUser((user, done) => {
    done(null, user.id);
});

// Retrieves user from session using ID
passport.deserializeUser(async (id, done) => {
    try {
        // Only select non-sensitive info
        const user = await pool.query("SELECT id, username, email FROM users WHERE id = $1", [id]);
        done(null, user.rows[0]);
    } catch (err) {
        done(err, null);
    }
});
// --- AUTH ROUTES ---

// 1. The "Sign in with Google" button links here
app.get('/auth/google',
    passport.authenticate('google')
);

// 2. Google redirects to this URL after login
app.get('/auth/google/callback',
    passport.authenticate('google', { failureRedirect: 'http://localhost:3000' }), // On failure, redirect to frontend
    (req, res) => {
        // Successful authentication, redirect to the frontend.
        res.redirect('http://localhost:3000');
    }
);

// 3. Frontend checks this route to see if user is logged in
app.get('/api/get-user', (req, res) => {
    if (req.user) {
        // req.user is added by passport
        res.status(200).json(req.user);
    } else {
        res.status(401).json({ error: "Not logged in" });
    }
});

// 4. Logout route
app.get('/api/logout', (req, res, next) => {
    req.logout((err) => {
        if (err) { return next(err); }
        res.redirect('http://localhost:3000');
    });
});


// --- Start Server ---
app.listen(PORT, () => {
    console.log(`Backend server is running on http://localhost:${PORT}`);
});