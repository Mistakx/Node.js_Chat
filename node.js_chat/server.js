let app  = require('express')();
let ejs = require('ejs');
let http = require('http').Server(app);
let io   = require('socket.io')(http);
let passport = require("passport");
let mongoose = require('mongoose');


app.set('view engine', 'ejs');
mongoose.connect('mongodb+srv://G9:rtLjPDj0sF0lE5HQ@clusterdbw.1dbjr.mongodb.net/G9?authSource=admin&replicaSet=atlas-bek8xj-shard-0&w=majority&readPreference=primary&appname=MongoDB%20Compass&retryWrites=true&ssl=true', {useNewUrlParser: true, useUnifiedTopology: true});


let people = {};


// Connect to Database
const db = mongoose.connection;
db.on('error', console.error.bind(console, 'Connection to database error.'));
db.once('open', function() { console.log('Connected to database.'); } );


// Server start
http.listen(3000, function(){
    console.log('listening on *:3000');
});



// Client connects to the server
io.on('connection', function(socket){

    // Client joins the server
    socket.on("join", function(clientUsername){
        //console.log(clientUsername+" has joined the server.");
        people[socket.id] = clientUsername;
        io.emit("update", clientUsername + " has joined the server.");
    });

    // Client sends chat message
    socket.on('chatMessage', function(clientMessage){
        //console.log('message: ' + clientMessage);
        let message = {msg:clientMessage, id:people[socket.id]};
        io.emit('chatMessage', message);
    })
});



// Client connects to the server route
app.get("/", (request, response) => {

    const isAuthenticated = !!request.user;

    response.render(isAuthenticated ? "index.ejs" : 'login.ejs');

});

// Register user
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
