import express from 'express';
import sql from 'mssql';
import cors from 'cors';
import multer from 'multer';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();

// Enhanced CORS configuration
app.use(cors({
  origin: 'http://localhost:3000',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true
}));
app.use(express.json());

// Database Configuration with connection pooling settings
const sqlConfig = {
  user: "sa",
  password: "123",
  database: "TRAVELLING2",
  server: "localhost",
  options: {
    encrypt: true,
    trustServerCertificate: true,
    enableArithAbort: true,
    pool: {
      max: 10,
      min: 0,
      idleTimeoutMillis: 30000,
      acquireTimeoutMillis: 60000
    }
  },
  port: 1433
};

const ASSETS_PATH = path.join('D:', 'SEMESTER 4', 'DBMS', 'Project', 'phase1', 'f', 'r', 'uploads');
if (!fs.existsSync(ASSETS_PATH)) 
{
  fs.mkdirSync(ASSETS_PATH, { recursive: true });
}

app.use('/uploads', (req, res, next) => {
  const filename = req.path.split('/').pop();
  const files = fs.readdirSync(ASSETS_PATH);
  
  const matchedFile = files.find(f => 
    f.toLowerCase().startsWith(filename.toLowerCase().split('.')[0])
  );

  if (matchedFile) {
    res.sendFile(path.join(ASSETS_PATH, matchedFile));
  } else {
    res.status(404).send('File not found');
  }
});
console.log('Checking uploads directory...');
try {
  fs.accessSync(ASSETS_PATH, fs.constants.R_OK | fs.constants.W_OK);
  console.log('Uploads directory is accessible:', ASSETS_PATH);
} catch (err) {
  console.error('Uploads directory error:', err);
  console.log('Attempting to create directory...');
  fs.mkdirSync(ASSETS_PATH, { recursive: true });
  console.log('Directory created:', ASSETS_PATH);
}
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      fs.mkdirSync(ASSETS_PATH, { recursive: true });
      cb(null, ASSETS_PATH);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      const normalizedExt = ext === '.jpeg' ? '.jpg' : ext;
      const uniqueName = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}${normalizedExt}`;
      cb(null, uniqueName);
    }
  }),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
});
// Creating and managing connection pool
let pool;
let poolConnect;

const initializePool = async () => {
  try {
    pool = new sql.ConnectionPool(sqlConfig);
    poolConnect = pool.connect();
    console.log('Creating new connection pool');
    
    pool.on('error', err => {
      console.error('Pool error:', err);
      // Attempt to reconnect after delay
      setTimeout(initializePool, 5000);
    });
    
    await poolConnect;
    console.log('Connected to SQL Server');
    return pool;
  } catch (err) {
    console.error('Initial connection error:', err);
    setTimeout(initializePool, 5000);
    throw err;
  }
};
// app.use('/uploads', express.static(ASSETS_PATH, {
//   setHeaders: (res, path) => {
//     const ext = path.extname(path).toLowerCase();
//     let contentType = 'application/octet-stream';
    
//     if (ext === '.jpg' || ext === '.jpeg') {
//       contentType = 'image/jpeg';
//     } else if (ext === '.png') {
//       contentType = 'image/png';
//     } else if (ext === '.gif') {
//       contentType = 'image/gif';
//     }
    
//     res.setHeader('Content-Type', contentType);
//   }
// }));

const checkDatabaseConnection = async (req, res, next) => {
  try {
    if (!pool.connected) {
      await initializePool();
    }
    // Simple query to verify connection
    await pool.request().query('SELECT 1 AS test');
    next();
  } catch (err) {
    console.error('Database connection check failed:', err);
    res.status(503).json({ 
      success: false, 
      message: "Database connection unavailable",
      error: err.message 
    });
  }
};

// Initialize database connection
initializePool().then(() => {
 
  app.post('/login', checkDatabaseConnection, async (req, res) => {
    const { email, password } = req.body;
    
    try {
      const request = pool.request();
      const result = await request
        .input('email', sql.VarChar(255), email)
        .input('password', sql.VarChar(255), password)
        .query(`
          SELECT 
            u.userID, 
            u.accountName, 
            u.userEmail,
            (SELECT TOP 1 th.area_name 
             FROM travel_history th 
             WHERE th.userID = u.userID
             ORDER BY th.end_date DESC) AS lastTripArea,
            (SELECT COUNT(DISTINCT th.history_id) 
             FROM travel_history th 
             WHERE th.userID = u.userID) AS numOfCitiesTravelled,
            (SELECT COUNT(DISTINCT th.history_id) 
             FROM travel_history th
             JOIN connections c ON th.history_id = c.shared_history_id
             WHERE c.Connections_status = 'accepted'
             AND (c.requester_userID = u.userID OR c.receiver_userID = u.userID)
             AND th.userID != u.userID) AS numOfSharedCitiesTravelled
          FROM user_info u
          WHERE u.userEmail = @email AND u.userPassword = @password
        `);
  
      if (result.recordset.length > 0) {
        const userData = result.recordset[0];
        const totalCities = (userData.numOfCitiesTravelled || 0) + (userData.numOfSharedCitiesTravelled || 0);
        
        res.json({
          success: true,
          user: {
            userID: userData.userID,
            accountName: userData.accountName,
            email: userData.userEmail,
            lastTrip: userData.lastTripArea || 'No trips recorded',
            citiesVisited: totalCities
          },
          timestamp: new Date().toISOString()
        });
      } else {
        res.status(401).json({ 
          success: false, 
          message: "Invalid credentials",
          timestamp: new Date().toISOString()
        });
      }
    } catch (err) {
      console.error('Login Error:', err);
      res.status(500).json({ 
        success: false, 
        message: "Database error",
        error: err.message,
        timestamp: new Date().toISOString()
      });
    }
  });
// Add this helper function near the top of your server.js file
function formatSqlDate(dateString) {
  if (!dateString) return 'No date';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-GB'); // Format as DD/MM/YYYY
}

app.post('/signup', checkDatabaseConnection, async (req, res) => {
  try {
    const { accountName, email, age, password } = req.body;

    // Validation remains the same
    if (!accountName || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Username, email, and password are required",
        timestamp: new Date().toISOString()
      });
    }

    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    
    try {
      // First request for checking existing user
      const checkRequest = new sql.Request(transaction);
      const checkResult = await checkRequest
        .input('checkEmail', sql.NVarChar(255), email)
        .input('checkAccountName', sql.NVarChar(255), accountName)
        .query(`
          SELECT 
            CASE WHEN userEmail = @checkEmail THEN 'email' 
                 WHEN accountName = @checkAccountName THEN 'username' 
            END AS conflict_type
          FROM user_info 
          WHERE userEmail = @checkEmail OR accountName = @checkAccountName
        `);

      if (checkResult.recordset.length > 0) {
        await transaction.rollback();
        const conflictType = checkResult.recordset[0].conflict_type;
        return res.status(409).json({
          success: false,
          message: conflictType === 'email' 
            ? "Email already exists" 
            : "Username already taken",
          timestamp: new Date().toISOString()
        });
      }

      // Second request for inserting new user
      const insertRequest = new sql.Request(transaction);
      const insertResult = await insertRequest
        .input('insertAccountName', sql.NVarChar(50), accountName)
        .input('insertUserEmail', sql.NVarChar(100), email)
        .input('insertUserPassword', sql.NVarChar(255), password)
        .input('insertUserAge', sql.Int, age || null)
        .query(`
          INSERT INTO user_info 
          (accountName, userEmail, userPassword, userAge)
          OUTPUT INSERTED.userID, INSERTED.accountName, INSERTED.userEmail
          VALUES (
            @insertAccountName, 
            @insertUserEmail, 
            @insertUserPassword, 
            @insertUserAge
          )
        `);

      await transaction.commit();

      res.status(201).json({
        success: true,
        user: {
          userID: insertResult.recordset[0].userID,
          accountName: insertResult.recordset[0].accountName,
          email: insertResult.recordset[0].userEmail
        },
        timestamp: new Date().toISOString()
      });

    } catch (err) {
      await transaction.rollback();
      console.error('Signup Transaction Error:', err);
      
      if (err.number === 2627) { // Unique constraint violation
        const message = err.message.includes('userEmail') 
          ? "Email already exists" 
          : "Username already taken";
        return res.status(409).json({
          success: false,
          message: message,
          timestamp: new Date().toISOString()
        });
      }
      
      res.status(500).json({
        success: false,
        message: "Registration failed",
        error: err.message,
        timestamp: new Date().toISOString()
      });
    }
  } catch (err) {
    console.error('Signup Error:', err);
    res.status(500).json({
      success: false,
      message: "Registration failed",
      error: err.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.post('/travel-history', 
  upload.array('images', 5),
  checkDatabaseConnection, 
  async (req, res) => {
    const { userID, title, area_name, description, experiences, startDate, endDate, location_name } = req.body;
    
    // Validate required fields
    if (!userID || !title || !location_name || !area_name || !startDate || !endDate) {
      // Clean up any uploaded files if validation fails
      if (req.files) {
        req.files.forEach(file => {
          try {
            fs.unlinkSync(path.join(ASSETS_PATH, file.filename));
          } catch (cleanupErr) {
            console.error('Error cleaning up file:', cleanupErr);
          }
        });
      }
      return res.status(400).json({
        success: false,
        message: "Missing required fields",
        timestamp: new Date().toISOString()
      });
    }

    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    
    try {
      const request = new sql.Request(transaction);
      const historyResult = await request
        .input('userID', sql.Int, userID)
        .input('title', sql.NVarChar(255), title)
        .input('area_name', sql.NVarChar(255), area_name)
        .input('description', sql.NVarChar(sql.MAX), description || '')
        .input('experiences', sql.NVarChar(sql.MAX), experiences || '')
        .input('startDate', sql.Date, startDate)
        .input('endDate', sql.Date, endDate)
        .input('location_name', sql.NVarChar(255), location_name || area_name)
        .query(`
          INSERT INTO travel_history 
          (userID, title, area_name, descriptionOfArea, experiences, startDate, end_date, location_name) 
          OUTPUT INSERTED.history_id
          VALUES (@userID, @title, @area_name, @description, @experiences, @startDate, @endDate, @location_name)
        `);

      const historyId = historyResult.recordset[0].history_id;

      // Handle file uploads if they exist
      if (req.files && req.files.length > 0) {
        for (const file of req.files) {
          const fileRequest = new sql.Request(transaction);
          await fileRequest
            .input('fileUserID', sql.Int, userID)
            .input('fileHistory_id', sql.Int, historyId)
            .input('fileMedia_url', sql.NVarChar(255), file.filename)
            .query(`
              INSERT INTO travel_media 
        (userID, history_id, media_url, media_type) 
        VALUES (@fileUserID, @fileHistory_id, @fileMedia_url, 'photo') 
        `);
        }
      }

      const updateRequest = new sql.Request(transaction);
      await updateRequest
        .input('userID', sql.Int, userID)
        .query(`
          UPDATE user_info
          SET 
            lastTrip = (SELECT TOP 1 area_name FROM travel_history 
                       WHERE userID = @userID 
                       ORDER BY end_date DESC),
            numOfCitiesTravelled = (SELECT COUNT(*) FROM travel_history 
                                   WHERE userID = @userID)
          WHERE userID = @userID
        `);
      await transaction.commit();
      
      res.status(201).json({ 
        success: true, 
        message: "Travel history added",
        historyId: historyId,
        timestamp: new Date().toISOString()
      });
    } catch (err) {
      await transaction.rollback();
      
      // Clean up any uploaded files if error occurred
      if (req.files) {
        req.files.forEach(file => {
          try {
            const filePath = path.join(ASSETS_PATH, file.filename);
            if (fs.existsSync(filePath)) {
              fs.unlinkSync(filePath);
            }
          } catch (cleanupErr) {
            console.error('Error cleaning up file:', cleanupErr);
          }
        });
      }
      
      console.error('Error adding travel history:', err);
      res.status(500).json({ 
        success: false, 
        message: "Failed to add history",
        error: err.message,
        timestamp: new Date().toISOString()
      });
    }
  }
);
// Update the GET /travel-media endpoint
app.get('/travel-media/:history_id', checkDatabaseConnection, async (req, res) => {
  try {
    const result = await pool.request()
      .input('history_id', sql.Int, req.params.history_id)
      .query('SELECT * FROM travel_media WHERE history_id = @history_id');
    
    // Map results to include full URL paths
    const mediaWithUrls = result.recordset.map(media => ({
      ...media,
      media_url: `/uploads/${media.media_url}`,
      url: `/uploads/${media.media_url}` // Add both for compatibility
    }));
    
    res.json(mediaWithUrls);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/likes', checkDatabaseConnection, async (req, res) => {
  const { userID, history_id } = req.body;

  if (!userID || !history_id) {
    return res.status(400).json({
      success: false,
      message: "userID and history_id are required",
      timestamp: new Date().toISOString()
    });
  }

  try {
    const result = await pool.request()
      .input('userID', sql.Int, userID)
      .input('history_id', sql.Int, history_id)
      .query(`
        INSERT INTO likes (userID, history_id)
        OUTPUT INSERTED.like_id, INSERTED.created_at
        VALUES (@userID, @history_id)
      `);

    res.status(201).json({
      success: true,
      like: result.recordset[0],
      message: "Like added successfully",
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    if (err.number === 2627) {
      // Violation of UNIQUE constraint (userID + history_id already exists)
      return res.status(409).json({
        success: false,
        message: "User has already liked this travel entry",
        timestamp: new Date().toISOString()
      });
    }

    console.error('Add Like Error:', err);
    res.status(500).json({
      success: false,
      message: "Failed to add like",
      error: err.message,
      timestamp: new Date().toISOString()
    });
  }
});


// Add this endpoint to test image serving
app.get('/test-image/:filename', (req, res) => {
  const filePath = path.join(ASSETS_PATH, req.params.filename);
  
  if (!fs.existsSync(filePath)) {
    return res.status(404).send('File not found');
  }

  const ext = path.extname(filePath).toLowerCase();
  let contentType = 'image/jpeg'; // default
  
  if (ext === '.png') contentType = 'image/png';
  if (ext === '.gif') contentType = 'image/gif';

  res.setHeader('Content-Type', contentType);
  res.sendFile(filePath);
});

// Add this to list all uploaded files with details
app.get('/uploaded-files', (req, res) => {
  fs.readdir(ASSETS_PATH, (err, files) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    
    const fileDetails = files.map(file => {
      const filePath = path.join(ASSETS_PATH, file);
      const stats = fs.statSync(filePath);
      
      return {
        filename: file,
        size: stats.size,
        created: stats.birthtime,
        modified: stats.mtime,
        path: filePath,
        url: `/uploads/${file}`
      };
    });
    
    res.json(fileDetails);
  });
});
  // Enhanced Get All Users with caching headers
  app.get('/users', checkDatabaseConnection, async (req, res) => {
    try {
      const result = await pool.request()
        .query(`SELECT userID, accountName, userEmail, userAge, created_at, lastTrip,
                numOfCitiesTravelled, numOfForeignCitiesTravelled 
                FROM user_info
                ORDER BY userID ASC`);

    
      res.set({
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'Last-Modified': new Date().toUTCString()
      });

      res.json({ 
        success: true, 
        users: result.recordset,
        timestamp: new Date().toISOString()
      });
    } catch (err) {
      console.error('Get Users Error:', err);
      res.status(500).json({ 
        success: false, 
        message: "Failed to fetch users",
        error: err.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Fixed User Profile Endpoint
  app.get('/user-profile/:userID', checkDatabaseConnection, async (req, res) => {
    try {
      const userID = parseInt(req.params.userID);
      if (isNaN(userID)) {
        return res.status(400).json({ 
          success: false, 
          message: "Invalid user ID",
          timestamp: new Date().toISOString()
        });
      }

      const result = await pool.request()
        .input('userID', sql.Int, userID)
        .query(`SELECT * FROM user_info WHERE userID = @userID`);

      if (result.recordset.length === 0) {
        return res.status(404).json({ 
          success: false, 
          message: "User not found",
          timestamp: new Date().toISOString()
        });
      }

      res.json({
        success: true,
        user: result.recordset[0],
        timestamp: new Date().toISOString()
      });
    } catch (err) {
      console.error('User Profile Error:', err);
      res.status(500).json({ 
        success: false, 
        message: "Database error",
        error: err.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  app.get('/travel-history', checkDatabaseConnection, async (req, res) => {
    try {
      // Perform the database query
      const result = await pool.request().query(`
        SELECT th.*, u.accountName 
        FROM travel_history th
        JOIN user_info u ON th.userID = u.userID
        ORDER BY th.startDate DESC
      `);
      
      // Return a success response with the travel data and timestamp
      res.json({ 
        success: true, 
        travels: result.recordset,
        timestamp: new Date().toISOString()
      });
    } catch (err) {
      console.error('Error fetching travel history:', err); // Log the full error for debugging
      res.status(500).json({ 
        success: false, 
        error: 'An error occurred while fetching travel history', // Avoid revealing full error messages to the client
      });
    }
  });


  app.get('/travel-history/:userID', checkDatabaseConnection, async (req, res) => {
    try {
      const userID = parseInt(req.params.userID);
      if (isNaN(userID)) {
        return res.status(400).json({ 
          success: false, 
          message: "Invalid user ID",
          timestamp: new Date().toISOString()
        });
      }
  
      // Get personal travel histories
      const personalQuery = `
        SELECT th.*, 'personal' AS history_type
        FROM travel_history th
        WHERE th.userID = @userID
      `;
  
      // Get shared travel histories
      const sharedQuery = `
        SELECT th.*, 'shared' AS history_type
        FROM travel_history th
        JOIN connections c ON th.history_id = c.shared_history_id
        WHERE c.Connections_status = 'accepted'
          AND th.userID != @userID
          AND (c.requester_userID = @userID OR c.receiver_userID = @userID)
      `;
  
      // Combine both queries
      const combinedQuery = `
        ${personalQuery}
        UNION ALL
        ${sharedQuery}
        ORDER BY startDate DESC
      `;
  
      const result = await pool.request()
        .input('userID', sql.Int, userID)
        .query(combinedQuery);
  
      // Get media for each trip and user details
      const travelsWithDetails = await Promise.all(
        result.recordset.map(async (trip) => {
          const [mediaResult, userResult] = await Promise.all([
            pool.request()
              .input('history_id', sql.Int, trip.history_id)
              .query('SELECT * FROM travel_media WHERE history_id = @history_id'),
            
            pool.request()
              .input('userID', sql.Int, trip.userID)
              .query('SELECT accountName FROM user_info WHERE userID = @userID')
          ]);
          
          return {
            ...trip,
            accountName: userResult.recordset[0]?.accountName || 'Unknown',
            media: mediaResult.recordset.map(m => ({
              ...m,
              media_url: `/uploads/${m.media_url}`,
              url: `/uploads/${m.media_url}`
            }))
          };
        })
      );
  
      res.json({
        success: true,
        travels: travelsWithDetails,
        timestamp: new Date().toISOString()
      });
    } catch (err) {
      console.error('Get Travel History Error:', err);
      res.status(500).json({ 
        success: false, 
        message: "Failed to fetch travel history",
        error: err.message,
        timestamp: new Date().toISOString()
      });
    }
  });
  // POST - Create new future goal
  app.post('/future-goals', checkDatabaseConnection, async (req, res) => {
    const { userID, title, description, target_date } = req.body;
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    
    try {
      const request = new sql.Request(transaction);
      await request
        .input('userID', sql.Int, userID)
        .input('title', sql.NVarChar(255), title)
        .input('description', sql.NVarChar(sql.MAX), description)
        .input('target_date', sql.Date, target_date)
        .query(`INSERT INTO future_goals 
                (userID, title, description, target_date) 
                VALUES (@userID, @title, @description, @target_date)`);
  
      await transaction.commit();
      res.status(201).json({ 
        success: true, 
        message: "Future goal added",
        timestamp: new Date().toISOString()
      });
    } catch (err) {
      await transaction.rollback();
      res.status(500).json({ 
        success: false, 
        message: "Failed to add future goal",
        error: err.message,
        timestamp: new Date().toISOString()
      });
    }
  });
  
  // GET - All future goals for a user
  app.get('/future-goals/:userID', checkDatabaseConnection, async (req, res) => {
    try {
      const userID = parseInt(req.params.userID);
      const result = await pool.request()
        .input('userID', sql.Int, userID)
        .query(`
          SELECT fg.*, u.accountName 
          FROM future_goals fg
          JOIN user_info u ON fg.userID = u.userID
          WHERE fg.userID = @userID
          ORDER BY fg.target_date ASC
        `);
      
      res.json({ 
        success: true, 
        goals: result.recordset,
        timestamp: new Date().toISOString()
      });
    } catch (err) {
      res.status(500).json({ 
        success: false, 
        error: err.message,
        timestamp: new Date().toISOString()
      });
    }
  });
  
  // PUT - Update a future goal
  app.put('/future-goals/:goalID', checkDatabaseConnection, async (req, res) => {
    const goalID = parseInt(req.params.goalID);
    const { title, description, target_date } = req.body;
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
  
    try {
      const request = new sql.Request(transaction);
      await request
        .input('goalID', sql.Int, goalID)
        .input('title', sql.NVarChar(255), title)
        .input('description', sql.NVarChar(sql.MAX), description)
        .input('target_date', sql.Date, target_date)
        .query(`
          UPDATE future_goals SET
            title = @title,
            description = @description,
            target_date = @target_date,
            updated_at = GETDATE()
          WHERE future_goal_id = @goalID
        `);
  
      await transaction.commit();
      res.json({ 
        success: true, 
        message: "Goal updated",
        timestamp: new Date().toISOString()
      });
    } catch (err) {
      await transaction.rollback();
      res.status(500).json({ 
        success: false, 
        message: "Failed to update goal",
        error: err.message,
        timestamp: new Date().toISOString()
      });
    }
  });
  
  // DELETE - Remove a future goal
  app.delete('/future-goals/:goalID', checkDatabaseConnection, async (req, res) => {
    const goalID = parseInt(req.params.goalID);
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
  
    try {
      const request = new sql.Request(transaction);
      const result = await request
        .input('goalID', sql.Int, goalID)
        .query('DELETE FROM future_goals WHERE future_goal_id = @goalID');
  
      if (result.rowsAffected[0] === 0) {
        await transaction.rollback();
        return res.status(404).json({ 
          success: false, 
          message: "Goal not found",
          timestamp: new Date().toISOString()
        });
      }
  
      await transaction.commit();
      res.json({ 
        success: true, 
        message: "Goal deleted",
        timestamp: new Date().toISOString()
      });
    } catch (err) {
      await transaction.rollback();
      res.status(500).json({ 
        success: false, 
        message: "Failed to delete goal",
        error: err.message,
        timestamp: new Date().toISOString()
      });
    }
  });
  // Enhanced Dashboard Endpoint
  app.get('/dashboard/:userID', checkDatabaseConnection, async (req, res) => {
    try {
      const userID = parseInt(req.params.userID);
      if (isNaN(userID)) {
        return res.status(400).json({ 
          success: false, 
          message: "Invalid user ID",
          timestamp: new Date().toISOString()
        });
      }

      // Use Promise.all for parallel queries
      const [userStats, recentTrips, upcomingGoals] = await Promise.all([
        pool.request()
          .input('userID', sql.Int, userID)
          .query(`SELECT numOfCitiesTravelled, numOfForeignCitiesTravelled, lastTrip
            FROM user_info WHERE userID = @userID`),
        
        pool.request()
          .input('userID', sql.Int, userID)
          .query(`SELECT TOP 3 * FROM travel_history 
                  WHERE userID = @userID 
                  ORDER BY startDate DESC`),
        
        pool.request()
          .input('userID', sql.Int, userID)
          .query(`SELECT TOP 3 * FROM future_goals 
                  WHERE userID = @userID 
                  ORDER BY target_date ASC`)
      ]);

      res.json({
        success: true,
        stats: {
          citiesVisited: userStats.recordset[0]?.numOfCitiesTravelled || 0,
          foreignCities: userStats.recordset[0]?.numOfForeignCitiesTravelled || 0,
          lastTrip: userStats.recordset[0]?.lastTrip || 'Never'
        },
        recentTrips: recentTrips.recordset,
        upcomingGoals: upcomingGoals.recordset,
        timestamp: new Date().toISOString()
      });

    } catch (err) {
      console.error("Dashboard Error:", err);
      res.status(500).json({ 
        success: false, 
        message: "Failed to load dashboard data",
        error: err.message,
        timestamp: new Date().toISOString()
      });
    }
  });


// Get comments for a trip
app.get('/comments/:history_id', checkDatabaseConnection, async (req, res) => {
  try {
    const result = await pool.request()
      .input('history_id', sql.Int, req.params.history_id)
      .query(`
        SELECT c.*, u.accountName 
        FROM comments c
        JOIN user_info u ON c.userID = u.userID
        WHERE c.history_id = @history_id
        ORDER BY c.created_at DESC
      `);
      
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get likes for a trip
app.get('/likes/:history_id', checkDatabaseConnection, async (req, res) => {
  try {
    const result = await pool.request()
      .input('history_id', sql.Int, req.params.history_id)
      .query(`
        SELECT l.*, u.accountName 
        FROM likes l
        JOIN user_info u ON l.userID = u.userID
        WHERE l.history_id = @history_id
        ORDER BY l.created_at DESC
      `);
      
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// // Get travel history records by country
// app.get('/travel-history-by-country', checkDatabaseConnection, async (req, res) => {
//   try {
//     const { area_name } = req.query;

//     if (!area_name || area_name.trim() === "") {
//       return res.status(400).json({
//         success: false,
//         message: "Country parameter is required",
//         timestamp: new Date().toISOString()
//       });
//     }

//     const trimmedArea = area_name.trim();

//     const result = await pool.request()
//       .input('area_name', sql.NVarChar(100), trimmedArea)
//       .query(`
//         SELECT th.*, u.accountName
//         FROM travel_history th
//         JOIN user_info u ON th.userID = u.userID
//         WHERE LOWER(th.area_name) = LOWER(@area_name)
//         ORDER BY th.startDate DESC
//       `);

//     res.json({
//       success: true,
//       travels: result.recordset,
//       timestamp: new Date().toISOString()
//     });
//   } catch (err) {
//     console.error('Error fetching travel history by country:', err);
//     res.status(500).json({
//       success: false,
//       message: "Failed to fetch travel history",
//       error: err.message,
//       timestamp: new Date().toISOString()
//     });
//   }
// });

app.get('/travel-history-by-country', checkDatabaseConnection, async (req, res) => {
  try {
    const { area_name } = req.query;

    if (!area_name || area_name.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "Country parameter is required",
        timestamp: new Date().toISOString()
      });
    }

    const trimmedArea = area_name.trim();

    const result = await pool.request()
      .input('area_name', sql.NVarChar(100), trimmedArea)
      .query(`
        SELECT th.*, u.accountName, 'personal' AS history_type
        FROM travel_history th
        JOIN user_info u ON th.userID = u.userID
        WHERE LOWER(th.area_name) = LOWER(@area_name)
        ORDER BY th.startDate DESC
      `);

    // Map results to include proper media URLs
    const travelsWithMedia = await Promise.all(
      result.recordset.map(async travel => {
        const mediaResult = await pool.request()
          .input('history_id', sql.Int, travel.history_id)
          .query('SELECT * FROM travel_media WHERE history_id = @history_id');
        
        return {
          ...travel,
          media: mediaResult.recordset.map(m => ({
            ...m,
            media_url: `/uploads/${m.media_url}`,
            url: `/uploads/${m.media_url}`
          }))
        };
      })
    );

    res.json({
      success: true,
      travels: travelsWithMedia,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('Error fetching travel history by country:', err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch travel history",
      error: err.message,
      timestamp: new Date().toISOString()
    });
  }
});
app.get('/search-travel-history', checkDatabaseConnection, async (req, res) => {
  try {
    const { area_name, userID } = req.query;

    if (!area_name || area_name.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "Country parameter is required",
        timestamp: new Date().toISOString()
      });
    }

    if (!userID) {
      return res.status(400).json({
        success: false,
        message: "User ID is required",
        timestamp: new Date().toISOString()
      });
    }

    const trimmedArea = area_name.trim();

    const result = await pool.request()
      .input('area_name', sql.NVarChar(100), trimmedArea)
      .input('userID', sql.Int, userID)
      .query(`
        -- Personal trips
        SELECT th.*, 'personal' AS history_type, u.accountName
        FROM travel_history th
        JOIN user_info u ON th.userID = u.userID
        WHERE LOWER(th.area_name) = LOWER(@area_name)
        AND th.userID = @userID
        
        UNION
        
        -- Shared trips
        SELECT th.*, 'shared' AS history_type, u.accountName
        FROM travel_history th
        JOIN connections c ON th.history_id = c.shared_history_id
        JOIN user_info u ON th.userID = u.userID
        WHERE LOWER(th.area_name) = LOWER(@area_name)
        AND c.Connections_status = 'accepted'
        AND th.userID != @userID
        AND (c.requester_userID = @userID OR c.receiver_userID = @userID)
        
        ORDER BY startDate DESC
      `);

    res.json({
      success: true,
      travels: result.recordset,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('Error searching travel history:', err);
    res.status(500).json({
      success: false,
      message: "Failed to search travel history",
      error: err.message,
      timestamp: new Date().toISOString()
    });
  }
});


app.put('/travel-history/:history_id', 
  upload.array('images', 5),
  checkDatabaseConnection, 
  async (req, res) => {
    const history_id = parseInt(req.params.history_id);
    const { userID, title, area_name, description, experiences, startDate, endDate, location_name } = req.body;
    
    if (isNaN(history_id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid history ID",
        timestamp: new Date().toISOString()
      });
    }

    // Validate required fields
    if (!userID || !title || !location_name || !area_name || !startDate || !endDate) {
      // Clean up any uploaded files if validation fails
      if (req.files) {
        req.files.forEach(file => {
          try {
            fs.unlinkSync(path.join(ASSETS_PATH, file.filename));
          } catch (cleanupErr) {
            console.error('Error cleaning up file:', cleanupErr);
          }
        });
      }
      return res.status(400).json({
        success: false,
        message: "Missing required fields",
        timestamp: new Date().toISOString()
      });
    }

    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    
    try {
      // Update the travel history record
      const request = new sql.Request(transaction);
      await request
        .input('history_id', sql.Int, history_id)
        .input('userID', sql.Int, userID)
        .input('title', sql.NVarChar(255), title)
        .input('area_name', sql.NVarChar(255), area_name)
        .input('description', sql.NVarChar(sql.MAX), description || '')
        .input('experiences', sql.NVarChar(sql.MAX), experiences || '')
        .input('startDate', sql.Date, startDate)
        .input('endDate', sql.Date, endDate)
        .input('location_name', sql.NVarChar(255), location_name || area_name)
        .query(`
          UPDATE travel_history SET
            title = @title,
            area_name = @area_name,
            descriptionOfArea = @description,
            experiences = @experiences,
            startDate = @startDate,
            end_date = @endDate,
            location_name = @location_name,
            updated_at = GETDATE()
          WHERE history_id = @history_id AND userID = @userID
        `);

      // Handle file uploads if they exist
      if (req.files && req.files.length > 0) {
        // First delete existing media for this history (optional - you might want to keep old media)
        // await new sql.Request(transaction)
        //   .input('history_id', sql.Int, history_id)
        //   .query('DELETE FROM travel_media WHERE history_id = @history_id');

        // Then add new media
        for (const file of req.files) {
          const fileRequest = new sql.Request(transaction);
          await fileRequest
            .input('fileUserID', sql.Int, userID)
            .input('fileHistory_id', sql.Int, history_id)
            .input('fileMedia_url', sql.NVarChar(255), file.filename)
            .query(`
              INSERT INTO travel_media 
              (userID, history_id, media_url, media_type) 
              VALUES (@fileUserID, @fileHistory_id, @fileMedia_url, 'photo')
            `);
        }
      }

      await transaction.commit();
      
      res.status(200).json({ 
        success: true, 
        message: "Travel history updated",
        historyId: history_id,
        timestamp: new Date().toISOString()
      });
    } catch (err) {
      await transaction.rollback();
      
      // Clean up any uploaded files if error occurred
      if (req.files) {
        req.files.forEach(file => {
          try {
            const filePath = path.join(ASSETS_PATH, file.filename);
            if (fs.existsSync(filePath)) {
              fs.unlinkSync(filePath);
            }
          } catch (cleanupErr) {
            console.error('Error cleaning up file:', cleanupErr);
          }
        });
      }
      
      console.error('Error updating travel history:', err);
      res.status(500).json({ 
        success: false, 
        message: "Failed to update history",
        error: err.message,
        timestamp: new Date().toISOString()
      });
    }
  }
);

app.delete('/travel-history/:history_id', checkDatabaseConnection, async (req, res) => {
  const history_id = parseInt(req.params.history_id);
  const { userID } = req.body; // Get userID from request body

  if (isNaN(history_id)) {
    return res.status(400).json({
      success: false,
      message: "Invalid history ID",
      timestamp: new Date().toISOString()
    });
  }

  if (!userID) {
    return res.status(400).json({
      success: false,
      message: "User ID is required",
      timestamp: new Date().toISOString()
    });
  }

  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  
  try {
    // First get media files to delete them later
    const mediaResult = await new sql.Request(transaction)
      .input('history_id', sql.Int, history_id)
      .query('SELECT media_url FROM travel_media WHERE history_id = @history_id');

    // Delete from likes and comments first (due to foreign key constraints)
    await new sql.Request(transaction)
      .input('history_id', sql.Int, history_id)
      .query('DELETE FROM likes WHERE history_id = @history_id');

    await new sql.Request(transaction)
      .input('history_id', sql.Int, history_id)
      .query('DELETE FROM comments WHERE history_id = @history_id');

    // Then delete from travel_media
    await new sql.Request(transaction)
      .input('history_id', sql.Int, history_id)
      .query('DELETE FROM travel_media WHERE history_id = @history_id');

    // Finally delete from travel_history
    const result = await new sql.Request(transaction)
      .input('history_id', sql.Int, history_id)
      .input('userID', sql.Int, userID)
      .query('DELETE FROM travel_history WHERE history_id = @history_id AND userID = @userID');

    if (result.rowsAffected[0] === 0) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: "Travel history not found or not owned by user",
        timestamp: new Date().toISOString()
      });
    }

    await transaction.commit();

    // Delete associated media files from filesystem
    mediaResult.recordset.forEach(media => {
      try {
        const filePath = path.join(ASSETS_PATH, media.media_url);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch (err) {
        console.error('Error deleting media file:', err);
      }
    });

    res.status(200).json({
      success: true,
      message: "Travel history deleted successfully",
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    await transaction.rollback();
    console.error('Error deleting travel history:', err);
    res.status(500).json({
      success: false,
      message: "Failed to delete travel history",
      error: err.message,
      timestamp: new Date().toISOString()
    });
  }
});
// Add this new endpoint for posting comments
app.post('/comments', checkDatabaseConnection, async (req, res) => {
  const { userID, history_id, comment_text } = req.body;
  
  try {
    const result = await pool.request()
      .input('userID', sql.Int, userID)
      .input('history_id', sql.Int, history_id)
      .input('comment_text', sql.NVarChar(sql.MAX), comment_text)
      .query(`
        INSERT INTO comments (userID, history_id, comment_text)
        OUTPUT INSERTED.comment_id, INSERTED.created_at
        VALUES (@userID, @history_id, @comment_text)
      `);
      
    // Get commenter details
    const commenter = await pool.request()
      .input('userID', sql.Int, userID)
      .query('SELECT accountName FROM user_info WHERE userID = @userID');

    res.status(201).json({
      success: true,
      comment: {
        ...result.recordset[0],
        accountName: commenter.recordset[0].accountName,
        comment_text
      }
    });
  } catch (err) {
    console.error('Error adding comment:', err);
    res.status(500).json({
      success: false,
      message: "Failed to add comment",
      error: err.message
    });
  }
});

app.get('/shared-history-details/:userID', checkDatabaseConnection, async (req, res) => {
  try {
    const userID = parseInt(req.params.userID);
    if (isNaN(userID)) {
      return res.status(400).json({ 
        success: false, 
        message: "Invalid user ID",
        timestamp: new Date().toISOString()
      });
    }

    // Query to get shared travel histories
    const sharedHistoriesQuery = `
      SELECT 
        th.history_id,
        th.title,
        th.area_name,
        th.location_name,
        th.startDate,
        th.end_date,
        th.descriptionOfArea,
        th.experiences,
        u.userID as owner_userID,
        u.accountName as owner_accountName,
        c.connection_id,
        c.Connections_status,
        CASE 
          WHEN c.requester_userID = @userID THEN c.receiver_userID
          ELSE c.requester_userID
        END AS other_userID,
        CASE 
          WHEN c.requester_userID = @userID THEN ur.accountName
          ELSE uq.accountName
        END AS other_accountName
      FROM travel_history th
      JOIN connections c ON th.history_id = c.shared_history_id
      JOIN user_info u ON th.userID = u.userID
      LEFT JOIN user_info ur ON c.receiver_userID = ur.userID
      LEFT JOIN user_info uq ON c.requester_userID = uq.userID
      WHERE c.Connections_status = 'accepted'
        AND th.userID != @userID
        AND (c.requester_userID = @userID OR c.receiver_userID = @userID)
      ORDER BY th.startDate DESC
    `;

    const result = await pool.request()
      .input('userID', sql.Int, userID)
      .query(sharedHistoriesQuery);

    // Get media for each shared history
    const historiesWithDetails = await Promise.all(
      result.recordset.map(async (history) => {
        const mediaResult = await pool.request()
          .input('history_id', sql.Int, history.history_id)
          .query('SELECT * FROM travel_media WHERE history_id = @history_id');
        
        return {
          ...history,
          media: mediaResult.recordset.map(m => ({
            ...m,
            media_url: `/uploads/${m.media_url}`,
            url: `/uploads/${m.media_url}`
          }))
        };
      })
    );

    res.json({
      success: true,
      sharedHistories: historiesWithDetails,
      count: historiesWithDetails.length,
      timestamp: new Date().toISOString()
    });

  } catch (err) {
    console.error('Error fetching shared history details:', err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch shared history details",
      error: err.message,
      timestamp: new Date().toISOString()
    });
  }
});
// Add this near your other route handlers
// app.get('/travel-media/:history_id', checkDatabaseConnection, async (req, res) => {
//   try {
//     const result = await pool.request()
//       .input('history_id', sql.Int, req.params.history_id)
//       .query('SELECT * FROM travel_media WHERE history_id = @history_id');
    
//     // Map results to include full URL paths
//     const mediaWithUrls = result.recordset.map(media => ({
//       ...media,
//       media_url: `/uploads/${media.media_url}`
//     }));
    
//     res.json(mediaWithUrls);
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// });

// Add to server.js
app.get('/list-uploads', (req, res) => {
  const files = fs.readdirSync(ASSETS_PATH);
  res.json({
    uploadsDirectory: ASSETS_PATH,
    filesAvailable: files
  });
});
app.get('/test-uploads', (req, res) => {
  fs.readdir(ASSETS_PATH, (err, files) => {
    if (err) {
      return res.status(500).json({ 
        success: false, 
        error: err.message,
        path: ASSETS_PATH 
      });
    }
    res.json({ 
      success: true, 
      files: files,
      uploadsPath: ASSETS_PATH 
    });
  });
});





  // Start Server
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });

}).catch(err => {
  console.error('Failed to initialize application:', err);
  process.exit(1);
});

// Process termination handlers
process.on('SIGINT', async () => {
  console.log('SIGINT received - closing server');
  try {
    if (pool) await pool.close();
    process.exit(0);
  } catch (err) {
    console.error('Error during shutdown:', err);
    process.exit(1);
  }
});

process.on('SIGTERM', async () => {
  console.log('SIGTERM received - closing server');
  try {
    if (pool) await pool.close();
    process.exit(0);
  } catch (err) {
    console.error('Error during shutdown:', err);
    process.exit(1);
  }
});