# Travel Website - Database Lab Project  

## Overview  
This is a full-stack Travel Website project developed as part of our Database Lab course. The application allows users to:  
- Share travel experiences with images.  
- Track past trips and future travel goals.  
- Connect with other travelers and share trip histories.  
- Like and comment on travel posts.  

## Technologies Used  
### **Backend**  
- **Node.js** with **Express.js**  
- **MSSQL** for database management  
- **Multer** for file uploads  
- **CORS** for cross-origin requests  

### **Frontend**  
- **React.js** (not included in this repository; see the frontend repo)  
- **Axios** for API calls  
- **CSS/JSX** for styling  

## Features  
- **User Authentication**: Login/Signup with validation.  
- **Travel History**: Add, edit, or delete trips with images.  
- **Social Features**: Like, comment, and share trips.  
- **Dashboard**: View travel stats, recent trips, and upcoming goals.  
- **Search**: Filter trips by country or user.  

## Setup Instructions  
1. **Database**:  
   - Ensure **SQL Server** is running.  
   - Restore the provided `TRAVELLING2` database.  

2. **Backend**:  
   - Install dependencies:  
     ```bash
     npm install express mssql cors multer
     ```  
   - Update `server.js` with your SQL credentials.  
   - Run the server:  
     ```bash
     node server.js
     ```  

3. **Frontend**:  
   - Clone the frontend repository (link to be added).  
   - Install dependencies and start the React app.  

