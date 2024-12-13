require('dotenv').config();
const express = require('express');
const path = require('path');
const axios = require('axios');
const cors = require('cors');
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;

const app = express();
const PORT = 3000;

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const API_KEY = process.env.API_KEY;
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const RANGE = process.env.RANGE;
const SESSION_SECRET = process.env.SESSION_SECRET;
const ALLOWED_EMAILS = ["ducanh-rd@quangminhpro.com", "ducanh-rd@quangminhpro.vn"];

// Cấu hình session
app.use(
    session({
        secret: SESSION_SECRET,
        resave: false,
        saveUninitialized: true,
    })
);

app.use(passport.initialize());
app.use(passport.session());
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// Passport configuration
passport.use(
    new GoogleStrategy(
        {
            clientID: GOOGLE_CLIENT_ID,
            clientSecret: GOOGLE_CLIENT_SECRET,
            callbackURL: 'https://tiendosanxuat.vercel.app/auth/google/callback',
        },
        (accessToken, refreshToken, profile, done) => {
            return done(null, profile);
        }
    )
);

// Serialize user information into session
passport.serializeUser((user, done) => {
    done(null, user);
});

// Deserialize user from session
passport.deserializeUser((user, done) => {
    done(null, user);
});

// Route to authenticate with Google
app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

// Callback route after authentication
app.get(
    '/auth/google/callback',
    passport.authenticate('google', { failureRedirect: '/login.html' }),
    (req, res) => {
        if (!ALLOWED_EMAILS.includes(req.user.emails[0].value)) {
            req.logout(() => {
                res.redirect('/login.html?error=access_denied');
            });
        } else {
            res.redirect('/index.html');
        }
    }
);

// Middleware to check authentication
function isAuthenticated(req, res, next) {
    if (req.isAuthenticated() && ALLOWED_EMAILS.includes(req.user.emails[0].value)) {
        return next();
    }
    res.redirect('/login.html?error=access_denied');
}

// Protected route for accessing index.html
app.get('/index.html', isAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Protected route for accessing data
app.get('/data', isAuthenticated, async (req, res) => {
    try {
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${RANGE}?key=${API_KEY}`;
        const response = await axios.get(url);

        const rawData = response.data.values || [];
        if (rawData.length === 0) {
            return res.status(200).json({ message: 'Không có dữ liệu trong phạm vi được chỉ định.' });
        }

        // Giữ nguyên tiêu đề và dữ liệu
        const updatedData = rawData;

        // Trả về dữ liệu
        res.status(200).json({ data: updatedData });
    } catch (error) {
        console.error('Error fetching data from Google Sheets:', error.response ? error.response.data : error.message);
        res.status(500).json({ error: error.response ? error.response.data : 'Failed to fetch data from Google Sheets' });
    }
});

// Serve login.html with JavaScript alert for error messages
app.get('/login.html', (req, res) => {
    const errorMessage = req.query.error === 'access_denied' ? 'Bạn không có quyền truy cập, hãy liên hệ với quản trị viên.' : '';
    res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Login</title>
            <script>
                window.onload = function() {
                    const error = "${errorMessage}";
                    if (error) {
                        alert(error);
                    }
                };
            </script>
        </head>
        <body>
            <h1>Login</h1>
            <a href="/auth/google">Đăng nhập với Google</a>
        </body>
        </html>
    `);
});

// Start server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
