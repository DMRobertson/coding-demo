function randomErrorPattern(byte, rate){
	let mask = 1;
	for (let i = 0; i < 8; i++){
		if (Math.random() < rate){
			byte ^= mask;
		}
		mask <<= 1;
	}
	return byte;
}

function simulate(bytes, start, end, rate) {
	for (let index = start; index < end; index += 4){
		for (let j = 0; j < 3; j++){
			bytes[index + j] = randomErrorPattern(bytes[index + j], rate);
			// ignore alpha channel
		}
	}
}

onmessage = function(e){
	let d = e.data;
	switch (d.action){
		case "simulate":
			simulate(d.bytes, d.start, d.end, d.rate);

			postMessage({
				action: "simulate",
				workerId: e.data.workerId,
				status: "complete"
			})
			break;
		default:
			break;
	}
}
