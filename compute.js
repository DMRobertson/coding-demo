"use strict";

const LAST_BYTE = 0b11111111;

const codes = {
	"rep2x": {
		encode: (x) => (x << 8) + x,
		isCodeword: (w) => (w & LAST_BYTE) === (w >>> 8),
		// Have to choose whether to take a bit from the first or last 8 bytes. Since each are equally plausible, just go with w. Should set first bytes = last bytes, but since decoding just takes the last byte, we don't bother.
		correct: (w) => w,
		decode: (w) => w & LAST_BYTE
	},
	"rep3x": {
		encode: (x) => (x << 16) + (x << 8) + x,
		isCodeword: function (w) {
			let head = w >>> 16;
			let mid = w >>> 8 & LAST_BYTE;
			let tail = w & LAST_BYTE;
			return head === mid && mid === tail;
		},
		correct: function(w) {
			let head = w >>> 16;
			let mid = w >>> 8 & LAST_BYTE;
			let tail = w & LAST_BYTE;
			/* Nearest codeword is one unit of Hamming distance away. Find an index where head, mid and tail do not all agree, with values h, m and t say. One digit will occur twice amongst these three bits; the other once. Set the bit in question of tail to be the value that occurs twice. */
			let mask = 1;
			for (let i = 0; i < 8; i++){
				let hbit = head & mask;
				let mbit = mid  & mask;
				let tbit = tail & mask;
				if (tbit !== hbit && tbit !== mbit) {
					// first two agree and are the winner; alter tail (inside w)
					w ^= mask;
				}
				// else: tail is the joint winner. Should change the loser, but since decoding already yields tail and that's already "correct", we won't bother.
				mask <<= 1;
			}
			return w;
		},
		decode: (w) => w & LAST_BYTE
	},
	"rep4x": {
		encode: (x) => (x << 24) + (x << 16) + (x << 8) + x,
		isCodeword: function (w) {
			let byte1 = w >>> 24
			let byte2 = w >>> 16 & LAST_BYTE;
			let byte3 = w >>> 8 & LAST_BYTE;
			let byte4 = w & LAST_BYTE;
			return byte1 === byte2 && byte2 === byte3 && byte3 == byte4;
		},
		correct: function(w) {
			let byte1 = w >>> 24
			let byte2 = w >>> 16 & LAST_BYTE;
			let byte3 = w >>> 8 & LAST_BYTE;
			let byte4 = w & LAST_BYTE;
			let mask = 1;
			for (let i = 0; i < 8; i++){
				let bit1 = byte1 & mask;
				let bit2 = byte2 & mask;
				let bit3 = byte3 & mask;
				let bit4 = byte4 & mask;
				// If bit 4 is equal to 2 or 3 of the other bits it's the winner
				// If it's equal to 1 of the other bits it's a tie
				// If it's equal to 0 of the other bits it's the loser
				if (bit4 !== bit1 && bit4 !== bit2 && bit4 !== bit3) {
					w ^= mask;
				}
				// Else should toggle the other bits but we don't care: decoding just strips off the last byte
				mask <<= 1;
			}
			return w;
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

function weight(error){
	let errors = 0;
	while (error){
		errors += error & 1;
		error >>>= 1;
	}
	return errors;
}

function simulateTransmission(p, settings){
	let raw = p.raw;
	let encoded = p.encoded;
	let decoded = p.decoded;
	
	let encodedPixelErrors = 0;
	let encodedPixelErrorsDetected = 0;
	let encodedPixelErrorsCorrectlyCorrected = 0;
	let decodedPixelErrors = 0;
	let uncodedPixelErrors = 0;
	
	let rawIndex = p.rawStart;
	let encodedIndex = p.encodedStart;
	switch (settings.unitsPerPixel){
		case 3:
			while (rawIndex < p.rawEnd){
				let uncodedPixelError = false;
				let encodedPixelError = false;
				let encodedPixelErrorDetected = false;
				// if we didn't notice an error, the following boolean is true
				let encodedPixelErrorCorrectlyCorrected = true;
				let decodedPixelError = false;
				
				for (let j = 0; j < 3; j++) {
					// Alice encodes
					encoded[encodedIndex + j] = settings.code.encode(raw[rawIndex + j]);
					// Channel applies noise
					let encodedNoise = randomErrorPattern(settings.bitErrorRate, settings.encodedUnitBits);
					if (encodedNoise !== 0){
						encodedPixelError = true;
					}
					let original = encoded[encodedIndex + j];
					encoded[encodedIndex + j] ^= encodedNoise;
					// Bob corrects if he spots an error
					if (!settings.code.isCodeword(encoded[encodedIndex + j])){
						encodedPixelErrorDetected = true;
						encoded[encodedIndex + j] = settings.code.correct(encoded[encodedIndex + j]);
						if (encoded[encodedIndex + j] !== original){
							encodedPixelErrorCorrectlyCorrected = false;
						}
					}
					// Bob decodes
					decoded[rawIndex + j] = settings.code.decode(encoded[encodedIndex + j]);
					if (decoded[rawIndex + j] !== raw[rawIndex + j]){
						decodedPixelError = true;
					}
						
					// For the visualisation, we simulate noise as if transmitted without a code
					// To be accurate to the spirit of the exercise, this should probably contain the decoding of (encoding + noise); but perhaps it'll be fast just to add noise to the raw image data.
					let rawNoise = randomErrorPattern(settings.bitErrorRate, 8);
					if (rawNoise !== 0){
						uncodedPixelError = true;
					}
					raw[rawIndex + j] ^= rawNoise;
					
				}
				decoded[rawIndex + 3] = 255; //set alpha = 1
				encodedPixelErrors += encodedPixelError;
				encodedPixelErrorsDetected += encodedPixelErrorDetected;
				encodedPixelErrorsCorrectlyCorrected += (encodedPixelErrorDetected && encodedPixelErrorCorrectlyCorrected);
				decodedPixelErrors += decodedPixelError;
				uncodedPixelErrors += uncodedPixelError;
				rawIndex += 4;
				encodedIndex += 3;
			}
		break;
	}
	return {
		encodedPixelErrors: encodedPixelErrors,
		encodedPixelErrorsDetected: encodedPixelErrorsDetected,
		encodedPixelErrorsCorrectlyCorrected: encodedPixelErrorsCorrectlyCorrected,
		decodedPixelErrors: decodedPixelErrors,
		uncodedPixelErrors: uncodedPixelErrors,
	};
}

onmessage = function(e){
	let p = e.data; // payload
	let settings = p.settings;
	settings.code = codes[settings.codeName];
	let results = simulateTransmission(p, settings);
	results.workerId = p.workerId;
	postMessage(results);
}
