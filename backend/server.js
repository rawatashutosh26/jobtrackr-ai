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
    saveUninitialized: false, 
    cookie: { 
        secure: false, 
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// --- Passport Setup ---
app.use(passport.initialize());
app.use(passport.session()); 

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
        accessType: 'offline', 
        prompt: 'consent'
    },
    async (accessToken, refreshToken, profile, done) => {
        const { id, displayName, emails } = profile;
        const email = emails[0].value;
        console.log("--- Google Callback Info ---");
        console.log("Refresh Token:", refreshToken); 
        
        if (!refreshToken) {
            console.warn("WARNING: No refresh token received.");
        }

        try {
            let user = await pool.query("SELECT * FROM users WHERE google_id = $1", [id]);

            if (user.rows.length === 0) {
                user = await pool.query(
                    "INSERT INTO users (google_id, username, email, refresh_token) VALUES ($1, $2, $3, $4) RETURNING *",
                    [id, displayName, email, refreshToken]
                );
                console.log("Created new user:", user.rows[0].username);
            } else {
                // Update token if it's different (or null)
                user = await pool.query(
                    "UPDATE users SET refresh_token = COALESCE($1, refresh_token), username = $2 WHERE google_id = $3 RETURNING *",
                    [refreshToken, displayName, id]
                );
                console.log("Updated existing user:", user.rows[0].username);
            }
            
            return done(null, user.rows[0]); 
        } catch (err) {
            console.error(err);
            return done(err, null);
        }
    }
));

// --- Passport Session Management ---
passport.serializeUser((user, done) => {
    done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
    try {
        const user = await pool.query("SELECT id, username, email FROM users WHERE id = $1", [id]);
        done(null, user.rows[0]);
    } catch (err) {
        done(err, null);
    }
});
// --- NEW MIDDLEWARE ---
// This function checks if a user is logged in
const isAuthenticated = (req, res, next) => {
    if (req.user) {
        // If req.user exists, they are logged in.
        // passport adds req.user from the session
        return next(); // Continue to the next function (the API route)
    } else {
        // If not logged in, send an error
        res.status(401).json({ error: "User not authenticated" });
    }
};

// --- AUTH ROUTES ---

// 1. The "Sign in with Google" button links here
app.get('/auth/google',
    passport.authenticate('google')
);

// 2. Google redirects to this URL after login
app.get('/auth/google/callback',
    passport.authenticate('google', { failureRedirect: 'http://localhost:3000' }),
    (req, res) => {
        res.redirect('http://localhost:3000');
    }
);

// 3. Frontend checks this route to see if user is logged in
app.get('/api/get-user', (req, res) => {
    if (req.user) {
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

// --- NEW API ROUTES (for Job Applications) ---

// [READ] Get all applications for the logged-in user
// We use our new 'isAuthenticated' middleware to protect this route
app.get('/api/applications', isAuthenticated, async (req, res) => {
    try {
        const result = await pool.query(
            "SELECT * FROM applications WHERE user_id = $1 ORDER BY application_date DESC",
            [req.user.id] // req.user.id comes from passport
        );
        res.status(200).json(result.rows);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: "Server error" });
    }
});

// [CREATE] Add a new application for the logged-in user
app.post('/api/applications', isAuthenticated, async (req, res) => {
    const { company_name, job_title, job_url, status, notes } = req.body;
    
    if (!company_name || !job_title) {
        return res.status(400).json({ error: "company_name and job_title are required." });
    }

    try {
        const newApp = await pool.query(
            "INSERT INTO applications (user_id, company_name, job_title, job_url, status, notes) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *",
            [req.user.id, company_name, job_title, job_url, status || 'Applied', notes]
        );
        res.status(201).json(newApp.rows[0]);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: "Server error" });
    }
});

// [UPDATE] Update an application
app.put('/api/applications/:id', isAuthenticated, async (req, res) => {
    const { id } = req.params;
    const { company_name, job_title, job_url, status, notes } = req.body;

    try {
        const updatedApp = await pool.query(
            `UPDATE applications 
             SET company_name = $1, job_title = $2, job_url = $3, status = $4, notes = $5 
             WHERE id = $6 AND user_id = $7 
             RETURNING *`,
            [company_name, job_title, job_url, status, notes, id, req.user.id] // Check user_id to make sure they own this app
        );

        if (updatedApp.rows.length === 0) {
            return res.status(404).json({ error: "Application not found or you don't own it." });
        }
        res.status(200).json(updatedApp.rows[0]);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: "Server error" });
    }
});

// [DELETE] Delete an application
app.delete('/api/applications/:id', isAuthenticated, async (req, res) => {
    const { id } = req.params;

    try {
        const deleteOp = await pool.query(
            "DELETE FROM applications WHERE id = $1 AND user_id = $2",
            [id, req.user.id] // Check user_id
        );

        if (deleteOp.rowCount === 0) {
            return res.status(404).json({ error: "Application not found or you don't own it." });
        }
        res.status(204).send(); // Success, no content to send back
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: "Server error" });
    }
});


// --- Start Server ---
app.listen(PORT, () => {
    console.log(`Backend server is running on http://localhost:${PORT}`);
});