let app  = require('express')();



// EJS
let ejs = require('ejs');
app.set('view engine', 'ejs');



// Middleware
let passport = require("passport");
let bodyParser = require("body-parser");
const session = require("express-session");
const sessionMiddleware = session({ secret: "changeit", resave: false, saveUninitialized: false });
app.use(sessionMiddleware);
app.use(bodyParser.urlencoded({ extended: false }));
app.use(passport.initialize());
app.use(passport.session());



// Connect to Database
let mongoose = require('mongoose');
mongoose.connect('mongodb+srv://G9:rtLjPDj0sF0lE5HQ@clusterdbw.1dbjr.mongodb.net/G9?authSource=admin&replicaSet=atlas-bek8xj-shard-0&w=majority&readPreference=primary&appname=MongoDB%20Compass&retryWrites=true&ssl=true', {useNewUrlParser: true, useUnifiedTopology: true});
const db = mongoose.connection;
db.on('error', console.error.bind(console, 'Connection to database error.'));
db.once('open', function() {
    console.log('Connected to database.');
});



// Database - Users
const userSchema = new mongoose.Schema({
    username: String,
    password: String,
});
userSchema.methods.verifyPassword = function (password) {
    return password === this.password;
}
const User = mongoose.model('User', userSchema);

// Database - Messages
const messageSchema = new mongoose.Schema({
    message: String
});
const Message = mongoose.model('Message', messageSchema);

// Database - Room
const roomSchema = new mongoose.Schema({
    name: String,
    admin: String,
    users: [String],
    privateRoom: Boolean
});
const Room = mongoose.model('Room', roomSchema);


// Socket.IO middlewares
let server = require("http").createServer(app);
const io = require('socket.io')(server);
const wrap = middleware => (socket, next) => middleware(socket.request, {}, next);
io.use(wrap(sessionMiddleware));
io.use(wrap(passport.initialize()));
io.use(wrap(passport.session()));
io.use((socket, next) => {
    if (socket.request.user) {
        next();
    } else {
        next(new Error('unauthorized'))
    }
});



// Client connects to the server - Socket.IO
io.on('connection', socket => {

    //console.log(`new connection ${socket.id}`);

    // Session data
    const session = socket.request.session;
    //console.log(`saving sid ${socket.id} in session ${session.id}`);
    session.socketId = socket.id;
    session.save();

    socket.on("joinServer", () => {
        // console.log("JOINED SERVER DEBUG")
        // console.log(socket.rooms); // prints all elements of the rooms object
        // socket.join("60d6489e56db0323c00e57d5");
        // console.log(socket.rooms); // prints all elements of the rooms object
        null;
    });

    socket.on('whoami', (callback) => {
        callback(socket.request.user.username);
    });

    // Client sends chat message
    socket.on('chatMessage', function(clientMessage) {

        // TODO: Maybe remove the ability to actually inject code in the messages and blow up the other client's computers, just a thought lol.
        // Not too important for now.
        //<script>alert(" Please don't send me in the chat :( ");</script>


        // clientMessage = {room: roomID, message: message}
        console.log('New message: ' + JSON.stringify(clientMessage));

        let message = {msg:clientMessage.message, id:socket.request.user.username};

        //socket.broadcast.to(user.room).emit('message',formatMessage(botName, `${user.username} has joined the chat`));
        console.log(socket.rooms); // prints all elements of the rooms object
        console.log(clientMessage.room)
        io.to(clientMessage.room).emit('chatMessage', message);
        //io.emit('chatMessage', message);

        const instance = new Message({ message: message.msg });
        instance.save(function (err, instance) {
            if (err) return console.error(err);
        });
    })

    // Client enters a chat room
    socket.on('enteredRoom', function(roomID) {

        // Exeptions - Invalid room format entered, room exists but the user is not in it, valid format but room doesn't exist

        let clientUsername = socket.request.user.username;

        console.log("User " + clientUsername + " entered room " + roomID);

            Room.findById(roomID, (error, roomData) => {

                if (error) {

                    console.log("User tried to enter an invalid room.");
                    io.to(socket.id).emit('update', "User tried to enter an invalid room.");


                } else {

                    try {

                        let roomUsers = roomData.users;
                        let userIsInRoom = false;

                        for (let i = 0; i < roomUsers.length; i++) {

                            // User is in the room
                            if (roomUsers[i] === clientUsername) {
                                userIsInRoom = true;
                                break;

                            }

                        }

                        if (userIsInRoom) {
                            console.log("Username is in room.")
                            io.to(socket.id).emit('update', "Succesfully entered the room.");
                            socket.join(roomID);
                            // console.log(socket.rooms);
                        } else {
                            console.log("User isn't in the room.")
                            //console.log(socket.request)
                            io.to(socket.id).emit('update', "User isn't in the room.");

                        }

                    }

                    catch (exception) {
                        console.log("User tried to enter a valid room that doesn't exist.");
                        io.to(socket.id).emit('update', "User tried to enter a valid room that doesn't exist.");
                    }
                }

            })

    })

    // Client creates a chat room
    socket.on('createRoom', function(chatName) {

        // console.log('chatName: ' + chatName);

        let clientUsername = socket.request.user.username

        const instance = new Room({
            name: chatName,
            users: [clientUsername],
            admin: clientUsername,
            privateRoom: true
        });

        instance.save(function (err, instance) {

            if (err) return console.error(err);

        });

    })

    // Client joins a chat room
    socket.on('joinRoom', function(roomID) {

        // console.log('chatName: ' + chatName);

        let clientUsername = socket.request.user.username;

        Room.findById(roomID, (error, data) => {

            if (error) {

                console.log(error);

            }

            else {

                console.log(data);

            }

        })

        Room.findByIdAndUpdate(roomID, { $push: { users: clientUsername } }).exec();

    })

    // Admin adds user to room
    socket.on('addUserToRoom', function(clientMessage) {

        // clientMessage = {room: roomID, usernameToAdd: clientUsername}

        let roomID = clientMessage.room;
        let usernameToAdd = clientMessage.usernameToAdd;

        Room.findById(roomID, (error, data) => {

            if (error) {

                console.log(error);

            }

            else {

                clientUsername = socket.request.user.username;
                let roomAdmin = data.admin;

                if (clientUsername === roomAdmin) {

                    Room.findByIdAndUpdate(roomID, { $push: { users: usernameToAdd } }).exec();

                }

            }

        })

    })

    // Admin changes the rooms privacy
    socket.on('changeRoomPrivacy', function(roomID) {

        Room.findById(roomID, (error, roomData) => {

            if (error) {

                console.log(error);

            }

            else {

                clientUsername = socket.request.user.username;
                let roomAdmin = roomData.admin;
                let roomPrivacy = roomData.privateRoom;

                if (clientUsername === roomAdmin) {

                    if (roomPrivacy === true) {

                        Room.findByIdAndUpdate(roomID, { privateRoom: false }).exec();


                    }

                    else if (roomPrivacy === false) {

                        Room.findByIdAndUpdate(roomID, { privateRoom: true }).exec();

                    }

                }

            }

        })

    })


    // User leaves user to room
    socket.on('leaveRoom', function(roomID) {

        Room.findById(roomID, (error, data) => {

            if (error) {

                console.log(error);

            }

            else {

                clientUsername = socket.request.user.username;

                // console.log("User to delete: " + clientUsername);
                // console.log("Room to delete user from: " + roomID);

                Room.findByIdAndUpdate(roomID, { $pull: { users: clientUsername } }).exec();



            }

        })

    })


});



// Server start
server.listen(3000, function(){
    console.log('Server started. Listening on port 3000.');
});



// Client connects to the server route
app.get("/", (request, response) => {

    const isAuthenticated = !!request.user;

    if (isAuthenticated) {

        let clientUsername = request.user.username

        // Find authenticated user's rooms
        Room.find({users : clientUsername}, (error, clientRooms) => {

            if (error) {

                console.log(error)

            }

            else {

                let chatRoomsParsedInfo = "";
                // console.log(clientRooms);
                // console.log(clientRooms[0]);
                // console.log(clientRooms[0]._id);

                // Parse user's rooms data
                for (let i = 0; i < clientRooms.length; i++) {

                    // Get the room's privacy
                    let roomPrivacy;
                    if (clientRooms[i].privateRoom) {
                        roomPrivacy = "Private";
                    }
                    else {
                        roomPrivacy = "Public";
                    }

                    roomAdmin = clientRooms[i].admin;

                    chatRoomsParsedInfo = chatRoomsParsedInfo + '<p>' + clientRooms[i]._id.toString() + " - " + clientRooms[i].name.toString() + ' (' + roomPrivacy + ') - ' + 'Admin: ' + roomAdmin + '</p>';

                }

                response.render('index.ejs', {userData: chatRoomsParsedInfo});

            }

        })

    }

    else {
        response.render('login.ejs');
    }

});



// Register user
const ensureLoggedOut = require('connect-ensure-login').ensureLoggedOut;
app.get("/register", ensureLoggedOut('/'), (request, response) => {

    response.render("register.ejs");

});

app.post("/register",function(request, response){

    // New user in the DB
    const instance = new User({ username: request.body.username, password: request.body.password });
    
    instance.save(function (err, instance) {
        if (err) return console.error(err);

        //Let's redirect to the login post which has auth
        response.redirect(307, '/login');
    });

});



// User login
const LocalStrategy = require("passport-local").Strategy;
passport.use(new LocalStrategy( function(username, password, done) {
        User.findOne({ username: username }, function (err, user) {
            if (err) { return done(err); }
            if (!user) { return done(null, false); }
            if (!user.verifyPassword(password)) { return done(null, false); }
            return done(null, user);
        });
    }));

passport.serializeUser((user, cb) => {
    //console.log(`serializeUser ${user.id}`);

    cb(null, user.id);

});
passport.deserializeUser((id, cb) => {

    //console.log(`deserializeUser ${id}`);

    User.findById(id, function (err, user) {
        if (err) { return cb(err); }
        cb(null, user);
    });

});

app.post("/login", passport.authenticate("local", {
    successRedirect: "/",
    failureRedirect: "/",
    }));


// User logout
app.post("/logout", (request, response) => {

    //console.log(`logout ${req.session.id}`);

    const socketId = request.session.socketId;

    if (socketId && io.of("/").sockets.get(socketId)) {
        console.log(`forcefully closing socket ${socketId}`);
        io.of("/").sockets.get(socketId).disconnect(true);
    }

    request.logout();
    response.cookie("connect.sid", "", { expires: new Date() });
    response.redirect("/");
});

// Chat
const ensureLoggedIn = require('connect-ensure-login').ensureLoggedIn;
app.get("/chat/:roomID", ensureLoggedIn('/'), (request, response) => {

    response.render('chat.ejs', {roomID : request.params.roomID});

});
