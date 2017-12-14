// const LAST_EIGHT_BITS = 0b11111111;

// function randByte(){
	// near-enough uniform over ints in [0, 256).
	// return Math.floor(Math.random() * 256);
// }

// function simulateNoise(bytes, start, width){
	// for (let index = start; index < start + width; index += 4){
		// bytes[index] ^= randByte();
	// }
// }

onmessage = function(e){
	console.log(e);
}