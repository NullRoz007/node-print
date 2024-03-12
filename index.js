const path = require('path');
const { exec } = require('child_process');
const fs = require('fs');
const net = require('net');

var npos = require('npos');
var parser = npos.parser();


var server = net.createServer(function(socket) {
	// === SOCKET EVENTS===
	// variable to track how many dataEvents have occured
	var dataEventCount = 0;
        socket.on('data', function(buffer) {
		var code = buffer.toString('hex', 0, 2);
		console.log("buffer[0..2] = " + code);

		// to fix, 'this printer is not working' errors client side, we just need to write to the socket with garbage data
		// this also speeds up printing as it causes the client to disconnect immediately after writing to the server
		socket.write("success");
		fs.appendFile('tmp.bin', buffer, () => {});
	});

        socket.on('end', socket.end)
});

server.on('connection', handleConnection);

server.listen(9100, function() {

	var networkInfo = "";
	exec('ifconfig', (error, stdout, stderr) => {
		console.log("=== NETWORK INFO ===");
		console.log(stdout);
		console.log("=== END ===");

		fs.unlink("./info.txt", () => {});
		fs.writeFile("./info.txt", stdout, () => {});

		exec('lpr info.txt', (error, stdout, stderr) => {});
	});

	// === DEBUG === //
        console.log('server listening to %j', server.address());
});

function onConnData(data) {
	//log data as it comes in
	console.log('=== DATA START ===')
	console.log(data);
	console.log('=== DATA END ===')
}

function onConnClose() {
	console.log("=== DECODE START ===");
	//load our temporary binary file into a buffer
	var buffer = fs.readFileSync('tmp.bin');

	//parse it according to the ESC/POS standard
	parser.parse(buffer).then(function (ast) {
		console.log(ast);
		console.log("=== DECODE END ===");
	});

	console.log("=== PRINT START ===")

	//quick and dirty, use lpr to print to the system default print, which should be the CUPS default (must setup printer in CUPS)
	exec('lpr -l tmp.bin', (error, stdout, stderr) => {
		if(error) console.log("Error: "+ error);
		if(stderr) console.log("StdError: "+ stderr);
		if(stdout) console.log(stdout);

		console.log("=== PRINT END ===");
	});
}

function onConnError(error) {}
function handleConnection(conn) {
	//new connection so assume we can remove any temporary files, 
	// TODO, proper job queue so we don't loose anything
	fs.unlink('./tmp.bin', () => {});

        var remoteAddress = conn.remoteAddress + ':' + conn.remotePort;
        console.log('new client connection from %s', remoteAddress);

	conn.on('data', onConnData);
        conn.once('close', onConnClose);
        conn.on('error', onConnError);
}
