import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './App.css';

// Tell axios to send cookies with all requests
axios.defaults.withCredentials = true;

const API_URL = 'http://localhost:5000';
const API_APPLICATIONS_URL = 'http://localhost:5000/api/applications';


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
                {user && (
                    <button onClick={logout} className="logout-btn">
                        Logout
                    </button>
                )}
            </header>

            {user ? (
                // --- USER IS LOGGED IN ---
                <Dashboard user={user} />
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

// --- NEW DASHBOARD COMPONENT ---
function Dashboard({ user }) {
    const [applications, setApplications] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    // Fetch all applications for this user
    const fetchApplications = async () => {
        try {
            setIsLoading(true);
            setError(null);
            const response = await axios.get(API_APPLICATIONS_URL);
            setApplications(response.data);
        } catch (err) {
            setError(err.response?.data?.error || "Failed to fetch applications.");
        } finally {
            setIsLoading(false);
        }
    };

    // Run fetchApplications() once when the dashboard loads
    useEffect(() => {
        fetchApplications();
    }, []);

    // --- CRUD Functions ---

    const addApplication = async (appData) => {
        try {
            await axios.post(API_APPLICATIONS_URL, appData);
            fetchApplications(); // Refresh list
        } catch (err) {
            alert("Error adding application: " + err.message);
        }
    };

    const updateApplication = async (id, updatedData) => {
        try {
            await axios.put(`${API_APPLICATIONS_URL}/${id}`, updatedData);
            fetchApplications(); // Refresh list
        } catch (err) {
            alert("Error updating application: " + err.message);
        }
    };

    const deleteApplication = async (id) => {
        if (window.confirm("Are you sure you want to delete this application?")) {
            try {
                await axios.delete(`${API_APPLICATIONS_URL}/${id}`);
                fetchApplications(); // Refresh list
            } catch (err) {
                alert("Error deleting application: " + err.message);
            }
        }
    };

    return (
        <div className="dashboard">
            <h2>Welcome, {user.username}!</h2>
            <ApplicationForm onAdd={addApplication} />
            <hr />
            {isLoading && <p>Loading applications...</p>}
            {error && <p className="error">{error}</p>}
            {!isLoading && !error && (
                <ApplicationList 
                    applications={applications} 
                    onUpdate={updateApplication}
                    onDelete={deleteApplication}
                />
            )}
        </div>
    );
}

// --- NEW APPLICATION FORM COMPONENT ---
function ApplicationForm({ onAdd }) {
    const [company, setCompany] = useState('');
    const [title, setTitle] = useState('');
    const [url, setUrl] = useState('');

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!company || !title) {
            alert("Company and Title are required.");
            return;
        }
        
        onAdd({
            company_name: company,
            job_title: title,
            job_url: url,
            status: 'Applied'
        });

        setCompany('');
        setTitle('');
        setUrl('');
    };

    return (
        <form className="app-form" onSubmit={handleSubmit}>
            <h3>Add New Application</h3>
            <input 
                type="text" 
                placeholder="Company Name" 
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                required 
            />
            <input 
                type="text" 
                placeholder="Job Title" 
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required 
            />
            <input 
                type="text" 
                placeholder="Job URL" 
                value={url}
                onChange={(e) => setUrl(e.target.value)}
            />
            <button type="submit">Add Application</button>
        </form>
    );
}

// --- NEW APPLICATION LIST COMPONENT ---
function ApplicationList({ applications, onUpdate, onDelete }) {
    if (applications.length === 0) {
        return <p>No applications tracked yet. Add one above!</p>;
    }

    return (
        <div className="app-list">
            <table>
                <thead>
                    <tr>
                        <th>Company</th>
                        <th>Job Title</th>
                        <th>Status</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {applications.map(app => (
                        <ApplicationItem 
                            key={app.id} 
                            app={app} 
                            onUpdate={onUpdate}
                            onDelete={onDelete}
                        />
                    ))}
                </tbody>
            </table>
        </div>
    );
}

// --- NEW APPLICATION ITEM COMPONENT ---
function ApplicationItem({ app, onUpdate, onDelete }) {
    
    const handleStatusChange = (e) => {
        const newStatus = e.target.value;
        onUpdate(app.id, {
            ...app, // Spread all existing app data
            status: newStatus // ...but change the status
        });
    };

    return (
        <tr className="app-item">
            <td>{app.company_name}</td>
            <td>
                <a href={app.job_url} target="_blank" rel="noopener noreferrer">
                    {app.job_title}
                </a>
            </td>
            <td>
                <select value={app.status} onChange={handleStatusChange}>
                    <option value="Applied">Applied</option>
                    <option value="Interviewing">Interviewing</option>
                    <option value="Offered">Offered</option>
                    <option value="Rejected">Rejected</option>
                </select>
            </td>
            <td className="actions">
                <button className="delete-btn" onClick={() => onDelete(app.id)}>
                    Delete
                </button>
            </td>
        </tr>
    );
}

export default App;
