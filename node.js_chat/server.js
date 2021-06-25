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
    users: [String]
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
io.on('connect', function(socket){

    //console.log(`new connection ${socket.id}`);

    // Session data
    const session = socket.request.session;
    //console.log(`saving sid ${socket.id} in session ${session.id}`);
    session.socketId = socket.id;
    session.save();


    socket.on('whoami', (cb) => {
        cb(socket.request.user.username);
    });

    // Client joins the server
    socket.on("join", function() {
        //console.log(socket.request.user.username+" joined server");
        //people[socket.id] = clientUsername;
        io.emit("update", socket.request.user.username + " has joined the server.");
    });

    // Client sends chat message
    socket.on('chatMessage', function(clientMessage){
        //console.log('message: ' + clientMessage);
        let message = {msg:clientMessage, id:socket.request.user.username};
        io.emit('chatMessage', message);

        const instance = new Message({ message: message.msg });
        instance.save(function (err, instance) {
            if (err) return console.error(err);
        });
    })

    // Client creates a chat room
    socket.on('createRoom', function(chatName) {

        // console.log('chatName: ' + chatName);

        let clientUsername = socket.request.user.username

        const instance = new Room({ name: chatName, users: [clientUsername]});
        instance.save(function (err, instance) {
            if (err) return console.error(err);

        });

    })

    // Client joins a chat room
    socket.on('joinRoom', function(chatID) {

        // console.log('chatName: ' + chatName);

        let clientUsername = socket.request.user.username

        Room.findById(chatID, (error, data) => {

            if (error) {

                console.log(error);

            }

            else {

                console.log(data);


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

        Room.find({users : clientUsername}, (error, clientRooms) => {

            if (error) {

                console.log(error)

            }

            else {

                let chatRoomsParsedInfo = "";
                // console.log(clientRooms);
                // console.log(clientRooms[0]);
                // console.log(clientRooms[0]._id);

                for (let i = 0; i < clientRooms.length; i++) {

                    chatRoomsParsedInfo = chatRoomsParsedInfo + '<p>' + clientRooms[i]._id.toString() + " - " + clientRooms[i].name.toString() + '</p>';
                    console.log(chatRoomsParsedInfo)
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
app.get("/chat", ensureLoggedIn('/'), (request, response) => {

    response.render('chat.ejs');

});

