const path = require('path');
const { exec } = require('child_process');
const fs = require('fs');
const net = require('net');

var npos = require('npos');
var parser = npos.parser();

console.log("=== PROGRAM SET===");
// Define ESCPOS Command here
// Printer hardware
const HW_INIT = Buffer.from([0x1b, 0x40]); // HW_INIT
const HW_SELECT = Buffer.from([0x1b, 0x3d, 0x01]); // HW_SELECT
const HW_RESET = Buffer.from([0x1b, 0x3f, 0x0a, 0x00]); // HW_RESET

// Feed control sequences
const CTL_LF = Buffer.from([0x0a]); // CTL_LF
const CTL_FF = Buffer.from([0x0c]); // CTL_FF
const CTL_CR = Buffer.from([0x0d]); // CTL_CR
const CTL_HT = Buffer.from([0x09]); // CTL_HT
const CTL_VT = Buffer.from([0x0b]); // CTL_VT

// Paper
const PAPER_FULL_CUT = Buffer.from([0x1d, 0x56, 0x00]); // PAPER_FULL_CUT
const PAPER_PARTIAL_CUT = Buffer.from([0x1d, 0x56, 0x01]); // PAPER_PARTIAL_CUT
const PAPER_CUT_A = Buffer.from([0x1d, 0x56, 0x41]); // PAPER_CUT_A
const PAPER_CUT_B = Buffer.from([0x1d, 0x56, 0x42]); // PAPER_CUT_B

// Cash Drawer
const CD_KICK_2 = Buffer.from([0x1b, 0x70, 0x00]); // CD_KICK_2
const CD_KICK_5 = Buffer.from([0x1b, 0x70, 0x01]); // CD_KICK_5

// Code Pages
const CP_SET = Buffer.from([0x1b, 0x74]); // CP_SET
const CP_CP437 = Buffer.from([0x0]); // CP_CP437
// Add the rest of the code pages similarly

// Text formatting
const TXT_NORMAL = Buffer.from([0x1b, 0x21, 0x00]); // TXT_NORMAL
// Implement the rest of the text formatting commands in the same way

// Barcodes
const BARCODE_TXT_OFF = Buffer.from([0x1d, 0x48, 0x00]); // BARCODE_TXT_OFF
// Implement the rest of the barcode commands in the same way

		// Blank line and full cut
const PROGRAMS = [{f: Buffer.concat([HW_INIT, CTL_FF, CTL_LF, PAPER_FULL_CUT]), name: "lc"}];

// Check if build directory exists, if not create it
if(!fs.existsSync("./bin/")) fs.mkdirSync("./bin");

// Helper fn, chuck if directory contains a file
const dirContains = (path, file) => {
	var files = fs.readdirSync(path);
	if(files.indexOf(file) != -1) return true;

	return false;
}

// Iterate through our list of escpos commands and
// write any missing escpoc commands to a binary file
for(var c in PROGRAMS) {
	// get the current command
	var command = PROGRAMS[c];
	// check if our build directory contains the file
	if(!dirContains("./bin/", "escpos-"+command.name+".bin")) {
		console.log("BUILD "+command.name+" | "+command.f.toString('hex'));
		fs.writeFile("./bin/escpos-"+command.name+".bin", command.f, () => {});
	} else {
		console.log("FOUND "+command.name+" | "+command.f.toString('hex'));
	}
}
console.log("=== DONE ===");

const DEBUG = true;
var server = net.createServer(function(socket) {
	// === SOCKET EVENTS===
	// variable to track how many dataEvents have occured
	var dataEventCount = 0;
        socket.on('data', function(buffer) {
		try {
			var code = buffer.toString('hex', 0, 2);
			var last = buffer.toString('hex', buffer.length - 4, buffer.length - 2);

			console.log("buffer[0..2] = " + code);
			console.log("buffer["+buffer.length+"] = "+last);
		} catch (error) {
			var date = new Date().toDateString()
			fs.appendFile("error-"+date+"buffer.bin", buffer);
			fs.appendFile("error-"+date+"-error.txt", error);
		}
		// to fix, 'this printer is not working' errors client side, we just need to write to the socket with garbage data
		// this also speeds up printing as it causes the client to disconnect immediately after writing to the server
		socket.write("success");
		fs.appendFile('tmp.bin', buffer, () => {});

		if(last === '1d56') {
			console.log("===PRINT & CUT===");

			//quick and dirty, use lpr to print to the system default print, which should be the CUPS default (must setup printer in CUPS)
			exec('lpr -l tmp.bin', (error, stdout, stderr) => {
				if(error) console.log("Error: "+ error);
				if(stderr) console.log("StdError: "+ stderr);
				if(stdout) console.log(stdout);
			});
		}
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

		if(DEBUG) {
			//fs.unlink("./info.txt", () => {});
			//fs.writeFile("./info.txt", stdout, () => {});
			exec('lpr info.txt', (error, stdout, stderr) => {});
			exec('lpr -l ./bin/escpos-lc.bin', (error, stdout, stderr) => {});
		}
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
	if(DEBUG) {
		console.log("=== DECODE START ===");
		//load our temporary binary file into a buffer
		var buffer = fs.readFileSync('tmp.bin');

		//parse it according to the ESC/POS standard
		parser.parse(buffer).then(function (ast) {
			console.log(ast);
			console.log("=== DECODE END ===");
		});
	}
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
