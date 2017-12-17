const LAST_BYTE = 0b11111111;

const codes = {
	"rep2x": {
		encode: (x) => (x << 8) + x,
		isCodeword: (w) => (w & LAST_BYTE) === (w >>> 8),
		correct: function(w) {
			let head = w >>> 8;
			let tail = w & LAST_BYTE;
			/* Nearest codeword is one unit of Hamming distance away. Find an index where head and tail disagree. Toggle this index in tail (within w). */
			let mask = 1;
			for (let i = 0; i < 8; i++){
				if (head & mask !== tail & mask){
					w ^= mask;
					return w;
				}
				mask <<= 1;
			}
		},
		decode: (w) => w & LAST_BYTE
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

function simulateTransmission(raw, start, end, settings) {
	let unitErrors = 0;
	let detectedErrors = 0;
	let correctCorrections = 0;
	// Message units are 24bit pixel strings, embedded as 32 bit strings rgba in this array
	for (let index = start; index < end; index ++){
		let pattern = randomErrorPattern(settings.bitErrorRate, 8 * raw.BYTES_PER_ELEMENT);
		unitErrors += (pattern !== 0);
		let original = raw[index];
		raw[index] ^= pattern;
		if (!settings.code.isCodeword(raw[index])){
			detectedErrors++;
			raw[index] = settings.code.correct(raw[index]);
			correctCorrections += raw[index] === original;
		}
	}
	return {
		unitErrors: unitErrors,
		detectedErrors: detectedErrors,
		correctCorrections: correctCorrections
	};
}

function encode(raw, rawStart, rawEnd, encoded, encodedStart, encodedEnd, settings){
	let rawIndex = rawStart;
	let encodedIndex = encodedStart;
	if (settings.unitsPerPixel == 3){
		while (rawIndex < rawEnd){
			for (let j = 0; j < 3; j++) {
				encoded[encodedIndex + j] = settings.code.encode(raw[rawIndex + j])
			}
			rawIndex += 4;
			encodedIndex += 3;
		}
	}
}

function decode(raw, decoded, rawStart, rawEnd, corrected, encodedStart, encodedEnd, settings){
	let codedPixelErrors = 0;
	let rawIndex = rawStart;
	let encodedIndex = encodedStart;
	if (settings.unitsPerPixel == 3){
		while (rawIndex < rawEnd){
			let codedPixelError = 0;
			for (let j = 0; j < 3; j++) {
				decoded[rawIndex + j] = settings.code.decode(corrected[encodedIndex + j]);
				codedPixelError |= raw[rawIndex+j] !== decoded[rawIndex + j];
			}
			codedPixelErrors += codedPixelError;
			rawIndex += 4;
			encodedIndex += 3;
		}
	}
	return codedPixelErrors;
}

function computeDiff(raw, decoded, diff, start, end){
	for (let i = start; i < end; i += 4){
		for (let j = 0; j < 3; j++){
			diff[i+j] = Math.abs(raw[i+j] - decoded[i+j]);
		}
	}
}

onmessage = function(e){
	// payload
	let p = e.data;
	let settings = p.settings;
	settings.code = codes[settings.codeName];
	let response = {
		workerId: p.workerId,
	};
	if (settings.codeName !== "none"){
		encode(p.raw, p.rawStart, p.rawEnd, p.encoded, p.encodedStart, p.encodedEnd, settings);
		let results = simulateTransmission(p.encoded, p.encodedStart, p.encodedEnd, settings);
		Object.assign(response, results);
		response.codedPixelErrors = decode(p.raw, p.decoded, p.rawStart, p.rawEnd, p.encoded, p.encodedStart, p.encodedEnd, settings);
	}
	response.uncodedPixelErrors = simulateNoiseRawImage(p.raw, p.rawStart, p.rawEnd, settings.bitErrorRate);
	if (settings.codeName !== "none"){
		computeDiff(p.raw, p.decoded, p.diff, p.rawStart, p.rawEnd);
	}
	postMessage(response);
}
