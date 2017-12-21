"use strict";

const LAST_BIT        = 0b00000001;
const LAST_NIBBLE     = 0b00001111;
const FIRST_NIBBLE    = 0b11110000;
const LAST_SEVEN_BITS = 0b01111111;
const LAST_BYTE       = 0b11111111;

const codes = {
	"rep2x": {
		encode: (x) => (x << 8) + x,
		// Have to choose whether to take a bit from the first or last 8 bytes. Since each are equally plausible, just go with w. Should set first bytes = last bytes, but since decoding just takes the last byte, we don't bother.
		isCodeword: (w) => (w & LAST_BYTE) === (w >>> 8),
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
	},
	"Ham(3)": {
		encode: function(x){
			/* We use the generator matrix G
				110|1000
				101|0100
				011|0010
				111|0001
			*/
			let b1 = (x >> 3) & LAST_BIT;
			let b2 = (x >> 2) & LAST_BIT;
			let b3 = (x >> 1) & LAST_BIT;
			let b4 = (x >> 0) & LAST_BIT;
			let w1 = b1 ^ b2 ^ b4;
			let w2 = b1 ^ b3 ^ b4;
			let w3 = b2 ^ b3 ^ b4;
			return (w1 << 6) + (w2 << 5) + (w3 << 4) + x;
		},
		isCodeword: function(w){
			return this.compute_syndrome(w) === 0;
		},
		compute_syndrome(w){
			/* A corresponding parity-check matrix is
				100|1101
				010|1011
				001|0111
			*/
			let w1 = (w >> 6) & LAST_BIT;
			let w2 = (w >> 5) & LAST_BIT;
			let w3 = (w >> 4) & LAST_BIT;
			let w4 = (w >> 3) & LAST_BIT;
			let w5 = (w >> 2) & LAST_BIT;
			let w6 = (w >> 1) & LAST_BIT;
			let w7 = (w >> 0) & LAST_BIT;
			// XOR (^) is the same as adding mod 2
			let s1 = w1 ^ w4 ^ w5 ^ w7;
			let s2 = w2 ^ w4 ^ w6 ^ w7;
			let s3 = w3 ^ w5 ^ w6 ^ w7;
			return (s1 << 2) + (s2 << 1) + (s3 << 0);
		},
		correct: function(w){
			let syndrome = this.compute_syndrome(w);
			// which column in H contains the binary expansion of i?
			if (syndrome !== 0){
				const indices = [3, 2, 6, 1, 5, 4, 7];
				let index = 7 - indices[syndrome - 1];
				return w ^ (1 << index);
			}
			return w;
		},
		decode: function(w){
			return w & LAST_NIBBLE;
		}
	},
	"Ham+(3)": {
		encode: function(x){
			let w = codes["Ham(3)"].encode(x);
			let checkBit = weight(w) % 2;
			return (checkBit << 7) + w;
		},
		isCodeword(w){
			let syndromeCheck = weight(w) % 2;
			let syndromeBase = codes["Ham(3)"].compute_syndrome(w & LAST_SEVEN_BITS);
			return (syndromeCheck === 0) && (syndromeBase === 0);
		},
		correct: function(w){
			let syndromeCheck = weight(w) % 2;
			let syndromeBase = codes["Ham(3)"].compute_syndrome(w);
			if (syndromeCheck !== 0){
				let checkBit = 1 << 7;
				if (syndromeBase === 0){
					return w ^ checkBit;
				} else {
					return (w & checkBit) + codes["Ham(3)"].correct(w & LAST_SEVEN_BITS);
				}
			}
			return w;
		},
		decode: function(w){
			return w & LAST_NIBBLE;
		}
	},
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

function simulateTransmission(p){
	let settings = p.settings;
	let raw = p.raw;
	let encoded = p.encoded;
	let decoded = p.decoded;
	
	let encodedPixelErrors = 0;
	let encodedPixelErrorsDetected = 0;
	let encodedPixelErrorsCorrectlyCorrected = 0;
	let decodedPixelErrors = 0;
	let uncodedPixelErrors = 0;
	
	switch (settings.dimension){
		case 4:
			var encoder = encodePixelByNibbles;
			var decoder = decodePixelToNibbles;
			break;
		case 8:
			var encoder = encodePixelByByte;
			var decoder = decodePixelToBytes;
			break;
	}
	// Loop over each pixel
	for (
		let rawIndex = p.rawStart, encodedIndex = p.encodedStart;
		rawIndex < p.rawEnd;
		rawIndex += 4, encodedIndex += settings.unitsPerPixel
	){
		// Alice encodes
		encoder(p, rawIndex, encodedIndex);
		
		let encodedPixelError = false;
		let encodedPixelErrorDetected = false;
		// if we didn't notice an error, the following boolean is true
		let encodedPixelErrorCorrectlyCorrected = true;
		let decodedPixelError = false;
		
		// For each encoded message unit describing the current pixel:
		for (let i = 0; i < settings.unitsPerPixel; i++){
			// Channel applies noise
			let encodedBeforeNoise = encoded[encodedIndex + i];
			let encodedNoise = randomErrorPattern(settings.bitErrorRate, settings.encodedUnitBits);
			if (encodedNoise !== 0){
				encodedPixelError = true;
				encoded[encodedIndex + i] ^= encodedNoise;
			}
			
			// Bob corrects
			if (!settings.code.isCodeword(encoded[encodedIndex + i])){
				encodedPixelErrorDetected = true;
				encoded[encodedIndex + i] = settings.code.correct(encoded[encodedIndex + i]);
				if (encoded[encodedIndex + i] !== encodedBeforeNoise){
					encodedPixelErrorCorrectlyCorrected = false;
				}
			}
		}
		
		// Bob decodes
		decoder(p, rawIndex, encodedIndex);
		decodedPixelError = checkForPixelError(p, rawIndex);
		p.decoded[rawIndex + 3] = 255; //set alpha = 1
		
		encodedPixelErrors += encodedPixelError;
		encodedPixelErrorsDetected += encodedPixelErrorDetected;
		encodedPixelErrorsCorrectlyCorrected += (encodedPixelErrorDetected && encodedPixelErrorCorrectlyCorrected);
		decodedPixelErrors += decodedPixelError;
	}
	
	/*
	// For the visualisation, we simulate noise as if transmitted without a code
	for (let rawIndex = p.rawStart; rawIndex < p.rawEnd; rawIndex += 4){
		let uncodedPixelError = false;
		for (let j = 0; j < 3; j++){
			// To be accurate to the spirit of the exercise, raw should probably contain the decoding of (encoding + noise); but we just add noise to the raw image.
			let rawNoise = randomErrorPattern(settings.bitErrorRate, 8);
			if (rawNoise !== 0){
				uncodedPixelError = true;
			}
			p.raw[rawIndex + j] ^= rawNoise;
		}
		uncodedPixelErrors += uncodedPixelError;
	}
	*/
			
	return {
		encodedPixelErrors: encodedPixelErrors,
		encodedPixelErrorsDetected: encodedPixelErrorsDetected,
		encodedPixelErrorsCorrectlyCorrected: encodedPixelErrorsCorrectlyCorrected,
		decodedPixelErrors: decodedPixelErrors,
		uncodedPixelErrors: uncodedPixelErrors,
	};
}

function encodePixelByByte(p, rawIndex, encodedIndex){
	for (let j = 0; j < 3; j++) {
		p.encoded[encodedIndex + j] = p.settings.code.encode(p.raw[rawIndex + j]);
	}
}

function decodePixelToBytes(p, rawIndex, encodedIndex){
	for (let j = 0; j < 3; j++){
		p.decoded[rawIndex + j] = p.settings.code.decode(p.encoded[encodedIndex + j]);
	}
}

function checkForPixelError(p, rawIndex){
	let decodedPixelError = false;
	for (let j = 0; j < 3; j++){
		if (p.decoded[rawIndex + j] !== p.raw[rawIndex + j]){
			decodedPixelError = true;
		}
	}
	return decodedPixelError;
}

function encodePixelByNibbles(p, rawIndex, encodedIndex){
	for (let j = 0; j < 3; j++) {
		p.encoded[encodedIndex + 2*j    ] = p.settings.code.encode(p.raw[rawIndex + j] >>> 4);
		p.encoded[encodedIndex + 2*j + 1] = p.settings.code.encode(p.raw[rawIndex + j] & LAST_NIBBLE);
	}
}

function decodePixelToNibbles(p, rawIndex, encodedIndex){
	let decodedPixelError = false;
	for (let j = 0; j < 3; j++) {
		p.decoded[rawIndex + j] = (
			( p.settings.code.decode(p.encoded[encodedIndex + 2*j]) << 4 )
			+ p.settings.code.decode(p.encoded[encodedIndex + 2*j + 1])
		);
	}
}


onmessage = function(e){
	let p = e.data; // payload
	let settings = p.settings;
	settings.code = codes[settings.codeName];
	let results = simulateTransmission(p, settings);
	results.workerId = p.workerId;
	postMessage(results);
}
