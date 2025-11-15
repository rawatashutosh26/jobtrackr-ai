import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './App.css';

// Tell axios to send cookies with all requests
axios.defaults.withCredentials = true;

const API_URL = 'http://localhost:5000';

function App() {
    const [user, setUser] = useState(null);
    const [isLoading, setIsLoading] = useState(true);

    // This function checks if we are already logged in (from a cookie)
    const fetchUser = async () => {
        try {
            const res = await axios.get(`${API_URL}/api/get-user`);
            setUser(res.data); // We are logged in
        } catch (error) {
            setUser(null); // We are not logged in
        }
        setIsLoading(false);
    };

    // Run fetchUser() once when the app first loads
    useEffect(() => {
        fetchUser();
    }, []);

    // This function redirects the user to the backend /auth/google route
    const loginWithGoogle = () => {
        window.location.href = `${API_URL}/auth/google`;
    };

    // This function logs us out
    const logout = async () => {
        await axios.get(`${API_URL}/api/logout`);
        setUser(null);
    };

    if (isLoading) {
        return <div className="app-container">Loading...</div>;
    }

    return (
        <div className="app-container">
            <header>
                <h1>JobTrackr AI</h1>
            </header>

            {user ? (
                // --- USER IS LOGGED IN ---
                <div className="dashboard">
                    <h2>Welcome, {user.username}!</h2>
                    <p>You are logged in with: {user.email}</p>
                    <button onClick={logout} className="logout-btn">
                        Logout
                    </button>
                    <hr />
                    <p>Phase 1 is complete. Phase 2 will be building the dashboard here.</p>
                </div>
            ) : (
                // --- USER IS LOGGED OUT ---
                <div className="login-container">
                    <h2>Please log in to continue</h2>
                    <p>This app reads your email to automate job tracking.</p>
                    <button className="google-login-btn" onClick={loginWithGoogle}>
                        Sign in with Google
                    </button>
                </div>
            )}
        </div>
    );
}

export default App;