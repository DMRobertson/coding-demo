"use strict"

function DTHasFile(dt){
	if (dt.items) {
		for (let i = 0; i < dt.items.length; i++) {
			if (dt.items[i].kind == "file") {
				return true;
			}
		}
	} else if (dt.files.length > 0) {
		return true;
	}
	return false;
}

function DTGetFile(dt){
	if (dt.items) {
		for (let i = 0; i < dt.items.length; i++) {
			if (dt.items[i].kind == "file") {
				return dt.items[i].getAsFile();
			}
		}
	} else if (dt.files.length > 0) {
		return dt.files[0];
	}
	return false;
}

let dragHandlers = {
	"enter": function (e){
		e.dataTransfer.dropEffect = "link";
		this.classList.add("mid_drag");
	},
	
	"over": function (e){
		e.preventDefault();
	},
	
	"leave": function (e){
		if (!this.contains(e.relatedTarget)){
			this.classList.remove("mid_drag");
		}
	},
	
	"drop": function (e){
		e.preventDefault();
		this.classList.remove("mid_drag");
		if (DTHasFile(e.dataTransfer)){
			loadFile(DTGetFile(e.dataTransfer));
		}
	},
	/* I don't understand why this needed if the dropzone will only receive image files. Dragend fires on the thing being dragged, which is outside of the browser's control. */
	"end": function (e) {
		let dt = ev.dataTransfer;
		if (dt.items) {
			for (let i = 0; i < dt.items.length; i++) {
				dt.items.remove(i);
			}
		} else {
			ev.dataTransfer.clearData();
		}
	}
}

function changeHandler(e){
	if (this.files.length > 0){
		loadFile(this.files[0]);
	}
}

function loadFile(file){
	let fr = new FileReader();
	fr.onload = function () {
		document.getElementById('sent').src = fr.result;
	}
	fr.readAsDataURL(file);
}

function getSettings(){
	const defaultSettings = {
		encode: x => x,
		encoded_length: 24, //for now let's assume this is less than 32
		error_probability: 0.15,
		apply_noise: function(x){
			let mask = 1;
			for (let i = 0; i < this.encoded_length; i++){
				if (Math.random() < this.error_probability){
					x ^= mask;
				}
				mask <<= 1;
			}
			return x;
		},
		transmit: function(x){
			return this.apply_noise(this.encode(x))
		},
	}
	
	let settings = Object.create(defaultSettings);
	settings.error_probability = document.getElementById("error_probability").valueAsNumber;
	return settings;
}

function errorProbabilityMoved(){
	let percentage = (this.value * 100).toFixed(1);
	document.querySelector("output[for='error_probability']").innerText = percentage + "%";
	document.getElementById("Bob").classList.add("out_of_date");
}

function errorProbabilityChanged(){
	imageChanged.call(document.getElementById('sent'));
}

function imageChanged(){
	if (this.naturalWidth === 0 || this.naturalHeight === 0){
		return;
	}
	document.getElementById("Bob").classList.add("recomputing");
	let canvas = document.querySelector("canvas");
	let ctx = canvas.getContext("2d", {alpha: false});
	// Setup canvas to be the static image
	let overscale = Math.max(1, this.naturalWidth/600, this.naturalHeight/600);
	canvas.width = Math.ceil(this.naturalWidth/overscale);
	canvas.height = Math.ceil(this.naturalHeight/overscale);
	ctx.drawImage(this, 0, 0, canvas.width, canvas.height);
	
	//Simulate noise according to the channel settings
	let settings = getSettings();
	let imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
	let pixels = imageData.data;
	const LAST_EIGHT_BITS = 0b11111111;
	// TODO: parallelise with web worker
	for (let index = 0; index < pixels.length; index += 4){
		// get message unit
		let message_unit = 
			pixels[index]
			+ (pixels[index + 1] << 8)
			+ (pixels[index + 2] << 16);
		let received = settings.transmit(message_unit);
		let r = received & LAST_EIGHT_BITS;
		received >>>= 8;
		let g = received & LAST_EIGHT_BITS;
		received >>>= 8;
		let b = received & LAST_EIGHT_BITS;
		pixels[index] = r;
		pixels[index + 1] = g;
		pixels[index + 2] = b;
	}
	ctx.putImageData(imageData, 0, 0);
	document.getElementById('received').src = canvas.toDataURL();
	document.getElementById('Bob').classList.remove("recomputing");
	document.getElementById("Bob").classList.remove("out_of_date");
	//TODO: am I leaking memory somewhere?
}

function main(){
	renderMathInElement(document.body, {
		delimiters: [ {
			left: "$",
			right: "$",
			display: false
		} ]
	});
	
	let drop_zone = document.body;
	drop_zone.addEventListener("drop", dragHandlers.drop);
	drop_zone.addEventListener("dragenter", dragHandlers.enter);
	drop_zone.addEventListener("dragleave", dragHandlers.leave);
	drop_zone.addEventListener("dragover", dragHandlers.over);
	drop_zone.addEventListener("dragend", dragHandlers.end);
	
	document.getElementById("get_image").addEventListener("change", changeHandler);
	document.getElementById("sent").addEventListener("load", imageChanged);
	
	let probability_slider = document.getElementById("error_probability");
	probability_slider.addEventListener("change", errorProbabilityChanged);
	probability_slider.addEventListener("input", errorProbabilityMoved);
}

document.addEventListener("DOMContentLoaded", main);
