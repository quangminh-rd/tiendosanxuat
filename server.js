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
const SPREADSHEET_ID_USER = process.env.SPREADSHEET_ID_USER;
const RANGE_USER = process.env.RANGE_USER;
const SESSION_SECRET = process.env.SESSION_SECRET;
let ALLOWED_EMAILS = [];

// Hàm để lấy danh sách email được cấp quyền từ Google Sheets
async function fetchAllowedEmails() {
    try {
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID_USER}/values/${RANGE_USER}?key=${API_KEY}`;
        const response = await axios.get(url);

        const rawData = response.data.values || [];
        if (rawData.length > 1) { // Bỏ qua tiêu đề nếu có
            // Lấy giá trị cột U (index 20 - 1 = 19)
            ALLOWED_EMAILS = rawData.slice(1).map(row => row[20]).filter(email => email); // Loại bỏ giá trị null hoặc undefined
        } else {
            console.warn('Không có email nào trong phạm vi được chỉ định.');
        }
    } catch (error) {
        console.error('Error fetching allowed emails:', error.response ? error.response.data : error.message);
    }
}

// Gọi hàm để cập nhật danh sách email khi khởi động server
fetchAllowedEmails();

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

// Passport configuration: https://kehoachsanxuat.vercel.app
passport.use(
    new GoogleStrategy(
        {
            clientID: GOOGLE_CLIENT_ID,
            clientSecret: GOOGLE_CLIENT_SECRET,
            callbackURL: 'https://kehoachsanxuat.vercel.app/auth/google/callback',
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

app.get(
    '/auth/google/callback',
    passport.authenticate('google', { failureRedirect: '/login.html' }),
    async (req, res) => {
        try {
            const userEmail = req.user.emails[0].value;

            // Gọi API Google Sheets để lấy dữ liệu từ RANGE_USER
            const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID_USER}/values/${RANGE_USER}?key=${API_KEY}`;
            const response = await axios.get(url);

            const rawData = response.data.values || [];

            // Tìm dòng có email ở cột U (index 20) khớp với userEmail
            const matchedRow = rawData.find(row => row[20] === userEmail);

            if (!matchedRow) {
                // Email không khớp, từ chối truy cập
                req.logout(() => {
                    res.redirect('/login.html?error=access_denied');
                });
                return;
            }

            // Lấy dữ liệu từ cột E (index 4) và cột H (index 7) của dòng khớp
            const maNhanvienUSER = matchedRow[4];
            const chucDanhUSER = matchedRow[7];

            // Lưu maNhanvienUSER và chucdanhUSER vào session
            req.session.maNhanvienUSER = maNhanvienUSER;
            req.session.chucDanhUSER = chucDanhUSER;

            // Chuyển hướng người dùng đến trang index.html
            res.redirect('/index.html');
        } catch (error) {
            console.error('Error during Google Sheets fetch:', error.message);
            res.redirect('/login.html?error=server_error');
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

// Route to fetch user data from Google Sheets
app.get('/user-data', isAuthenticated, async (req, res) => {
    try {
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID_USER}/values/${RANGE_USER}?key=${API_KEY}`;
        const response = await axios.get(url);

        const rawData = response.data.values || [];
        if (rawData.length === 0) {
            return res.status(200).json({ message: 'Không có dữ liệu trong phạm vi được chỉ định.' });
        }

        // Giữ nguyên dữ liệu người dùng
        const updatedUserData = rawData;

        // Trả về dữ liệu người dùng
        res.status(200).json({ data: updatedUserData });
    } catch (error) {
        console.error('Error fetching user data from Google Sheets:', error.response ? error.response.data : error.message);
        res.status(500).json({ error: error.response ? error.response.data : 'Failed to fetch user data from Google Sheets' });
    }
});

app.get('/user-info', isAuthenticated, (req, res) => {
    res.json({
        maNhanvienUSER: req.session.maNhanvienUSER || null,
        chucDanhUSER: req.session.chucDanhUSER || null,
    });
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
