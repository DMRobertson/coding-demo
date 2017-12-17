const codes = {
	"rep2x": {
		encode: (x) => (x << 8) + x,
	}
}

function randomErrorPattern(rate, bitlength){
	let pattern = 0;
	let mask = 1;
	for (let i = 0; i < bitlength; i++){
		if (Math.random() < rate){
			pattern ^= mask;
		}
		mask <<= 1;
	}
	return pattern;
}

function simulateNoiseRawImage(raw, start, end, rate) {
	let pixelErrors = 0;
	// Message units are 24bit pixel strings, embedded as 32 bit strings rgba in this array
	for (let index = start; index < end; index += 4){
		let pixelError = 0;
		// We ignore the alpha channel a
		for (let j = 0; j < 3; j++) {
			let pattern = randomErrorPattern(rate, 8);
			pixelError |= (pattern !== 0);
			raw[index + j] ^= pattern;
		}
		pixelErrors += pixelError;
	}
	return pixelErrors;
}

function encode(raw, rawStart, rawEnd, encoded, encodedStart, encodedEnd, settings){
	let rawIndex = rawStart;
	let code = codes[settings.code];
	let encodedIndex = encodedStart;
	if (settings.unitsPerPixel == 3){
		while (rawIndex < rawEnd){
			for (let j = 0; j < 3; j++) {
				encoded[encodedIndex + j] = code.encode(raw[rawIndex + j])
			}
			rawIndex += 4;
			encodedIndex += 3;
		}
	}
}

onmessage = function(e){
	// payload
	let p = e.data;
	let settings = p.settings;
	let response = {
		workerId: p.workerId,
	};
	encode(p.raw, p.rawStart, p.rawEnd, p.encoded, p.encodedStart, p.encodedEnd, settings);
	let pixelErrors = simulateNoiseRawImage(p.raw, p.rawStart, p.rawEnd, settings.bitErrorRate);
	response.pixelErrors = pixelErrors;
	postMessage(response);
}
