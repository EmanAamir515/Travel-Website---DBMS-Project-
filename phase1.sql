-- Create Database

CREATE DATABASE TRAVELLING2;
GO
USE TRAVELLING2;
GO

create table user_info (

userID int PRIMARY KEY NOT NULL ,		--------FK 
userPassword varchar(10) UNIQUE NOT NULL,
accountName varchar(50) UNIQUE  NOT NULL,		-------FK in likes and accounts
userAge int,
userEmail varchar(100) UNIQUE NOT NULL,
created_at DATETIME2 DEFAULT SYSDATETIME(),
lastTrip varchar(100),				-------latest journey
numOfCitiesTravelled int ,			-----in home country
numOfForiegnCitiesTravelled int,

) ;
-- Travel History (Public Journals)
CREATE TABLE travel_history (
    history_id INT IDENTITY(1,1) PRIMARY KEY,
    userID INT NOT NULL,			---FK
    title VARCHAR(255) NOT NULL,			
	area_name VARCHAR(255) NOT NULL,		----name of country , city 
    
	descriptionOfArea VARCHAR(MAX),				-- area details names of other famous places visited
    experiences VARCHAR(MAX) NOT NULL,			---personal experience 
    startDate DATE NOT NULL,
    end_date DATE NOT NULL,

    location_name VARCHAR(255) NOT NULL,		--Location URL 
    
    created_at DATETIME2 DEFAULT SYSDATETIME(),
    updated_at DATETIME2 DEFAULT SYSDATETIME(),

    CONSTRAINT FK_travelUser  FOREIGN KEY (userID) REFERENCES user_info(userID) ON DELETE CASCADE
);
-- Future Travel Plans (Private)
CREATE TABLE future_goals (
    future_goal_id INT IDENTITY(1,1) PRIMARY KEY,
    userID INT NOT NULL,
    title VARCHAR(255) NOT NULL,
    description VARCHAR(MAX) NOT NULL,
    target_date DATE,
    created_at DATETIME2 DEFAULT SYSDATETIME(),
    updated_at DATETIME2 DEFAULT SYSDATETIME(),
    CONSTRAINT FK_userGoals FOREIGN KEY (userID) REFERENCES user_info(userID) ON DELETE CASCADE
);
-- Travel Media (Photos/Videos)
CREATE TABLE travel_media ( -----it will be a separate table for each journey
    media_id INT IDENTITY(1,1) PRIMARY KEY,
	userID INT NOT NULL,			---FK
    history_id INT ,	
	future_id INT ,
    media_url VARCHAR(255) NOT NULL,
    media_type VARCHAR(10) NOT NULL CHECK (media_type IN ('photo', 'video')),
    caption VARCHAR(MAX),
    uploaded_at DATETIME2 DEFAULT SYSDATETIME(),

	 CONSTRAINT FK_future_Media  FOREIGN KEY (future_id) REFERENCES future_goals(future_goal_id)ON DELETE NO ACTION ,
     CONSTRAINT FK_history_Media  FOREIGN KEY (history_id) REFERENCES travel_history(history_id)ON DELETE NO ACTION,
	 CONSTRAINT FK_user_ID  FOREIGN KEY (userID) REFERENCES user_info(userID) ON DELETE CASCADE
);

-- Accommodations
CREATE TABLE accommodations (		------not for future goals only for history 
    accommodation_id INT PRIMARY KEY,
	userID INT NOT NULL,			---FK
    history_id INT NOT NULL,
    nameAcc VARCHAR(255) NOT NULL,
    Acc_type VARCHAR(50) NOT NULL,
    check_in_date DATE NOT NULL,
    check_out_date DATE NOT NULL,
    Acc_address VARCHAR(MAX) NOT NULL,
	reviews VARCHAR(MAX),
    created_at DATETIME2 DEFAULT SYSDATETIME(),
    CONSTRAINT FK_history_Acc FOREIGN KEY (history_id) REFERENCES travel_history(history_id) ON DELETE NO ACTION,
	CONSTRAINT FK_user_ID_Acc FOREIGN KEY (userID) REFERENCES user_info(userID) ON DELETE CASCADE
);



-- User Connections (Fixed Issue)
CREATE TABLE connections (		--- friends for mutual journey sharing 
    connection_id INT IDENTITY(1,1) PRIMARY KEY,
    requester_userID INT NOT NULL,
    receiver_userID INT NOT NULL,
    Connections_status VARCHAR(10) DEFAULT 'pending' CHECK (Connections_status IN ('pending', 'accepted', 'declined')),
    created_at DATETIME2 DEFAULT SYSDATETIME(),
    CONSTRAINT FK_requested_ID FOREIGN KEY (requester_userID) REFERENCES user_info(userID) ON DELETE NO ACTION,
    CONSTRAINT FK_receiver_ID FOREIGN KEY (receiver_userID) REFERENCES user_info(userID) ON DELETE NO ACTION,
    UNIQUE (requester_userID, receiver_userID)
);

-- Comments System
CREATE TABLE comments (
    comment_id INT IDENTITY(1,1) PRIMARY KEY,
    userID INT NOT NULL,
    history_id INT NOT NULL,
    comment_text VARCHAR(MAX) NOT NULL,
    created_at DATETIME2 DEFAULT SYSDATETIME(),
    CONSTRAINT FK_comments_user FOREIGN KEY (userID) REFERENCES user_info(userID) ON DELETE NO ACTION,
    CONSTRAINT FK_history_id FOREIGN KEY (history_id) REFERENCES travel_history(history_id) ON DELETE NO ACTION
);

-- Likes System
CREATE TABLE likes (
    like_id INT IDENTITY(1,1) PRIMARY KEY,
    userID INT NOT NULL,
    history_id INT NOT NULL,
    created_at DATETIME2 DEFAULT SYSDATETIME(),
    CONSTRAINT FK_user_ID_Likes FOREIGN KEY (userID) REFERENCES user_info(userID) ON DELETE SET NULL,
    CONSTRAINT FK_history_ID_Likes FOREIGN KEY (history_id) REFERENCES travel_history(history_id) ON DELETE NO ACTION,
    UNIQUE (userID, history_id)
);

DROP TABLE likes

select * from user_info;
select * from accommodations;
select * from connections;
select * from travel_history;
select * from future_goals;
select * from travel_media;
select * from comments;

-- Likes System
CREATE TABLE likes (
    like_id INT IDENTITY(1,1) PRIMARY KEY,
    userID INT NOT NULL,
    history_id INT NOT NULL,
    created_at DATETIME2 DEFAULT SYSDATETIME(),
    CONSTRAINT FK_user_ID_Likes FOREIGN KEY (userID) REFERENCES user_info(userID) ON DELETE SET NULL,
    CONSTRAINT FK_history_ID_Likes FOREIGN KEY (history_id) REFERENCES travel_history(history_id) ON DELETE NO ACTION,
    UNIQUE (userID, history_id)
);
select * from likes;