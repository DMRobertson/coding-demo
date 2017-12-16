function randomErrorPattern(rate){
	let pattern = 0;
	let errors = 0;
	let mask = 1;
	for (let i = 0; i < 8; i++){
		if (Math.random() < rate){
			errors++;
			pattern ^= mask;
		}
		mask <<= 1;
	}
	return {
		bitErrors: errors,
		pattern: pattern
	};
}

function simulateNoise(bytes, start, end, rate) {
	let bitErrors = 0;
	let byteErrors = 0;
	for (let index = start; index < end; index += 4){
		// ignore alpha channel
		for (let j = 0; j < 3; j++) {
			let result = randomErrorPattern(rate);
			bitErrors += result.bitErrors;
			byteErrors += (result.bitErrors !== 0);
			bytes[index + j] ^= result.pattern;
		}
	}
	return {
		bitErrors: bitErrors,
		byteErrors: byteErrors
	};
}

onmessage = function(e){
	let d = e.data;
	let response = {
		action: d.action,
		workerId: d.workerId,
	};
	switch (d.action){
		case "simulateNoise":
			let result = simulateNoise(d.bytes, d.start, d.end, d.rate);
			Object.assign(response, result);
			response.bytesSent = 3 * (d.end - d.start) / 4;
			response.bitsSent = response.bytesSent * 8;
			postMessage(response);
			break;
		default:
			break;
	}
}
