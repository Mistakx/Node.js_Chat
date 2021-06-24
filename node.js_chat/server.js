let app  = require('express')();
let ejs = require('ejs');
let http = require('http').Server(app);
let io   = require('socket.io')(http);



app.set('view engine', 'ejs');



let people = {};



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
app.get('/', function(request, response){
    response.render('chat.ejs');
});