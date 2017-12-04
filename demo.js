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
		console.log("enter");
		e.dataTransfer.dropEffect = "link";
		this.classList.toggle("mid_drag", DTHasFile(e.dataTransfer));
	},
	
	"over": function (e){
		console.log("over");
		e.preventDefault();
	},
	
	"leave": function (e){
		console.log("leave");
		this.classList.remove("mid_drag");
	},
	
	"drop": function (e){
		console.log("drop");
		e.preventDefault();
		if (DTHasFile(e.dataTransfer)){
			this.classList.remove("mid_drag");
			loadFile(DTGetFile(e.dataTransfer));
		}
	},
	/* I don't understand why this needed if the dropzone will only receive image files. Dragend fires on the thing being dragged, which is outside of the browser's control. */
	"end": function (e) {
		console.log("end");
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

function imageChanged(){
	let canvas = document.querySelector("canvas");
	let ctx = canvas.getContext("2d", {alpha: false});
	// Setup canvas to be the static image
	let overscale = Math.max(1, this.naturalWidth/800, this.naturalHeight/800);
	canvas.width = Math.ceil(this.naturalWidth/overscale);
	canvas.height = Math.ceil(this.naturalHeight/overscale);
	console.log(Math.ceil(this.naturalWidth/overscale), Math.ceil(this.naturalHeight/overscale));
	ctx.drawImage(this, 0, 0);
	
	let settings = {
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
	
	//Simulate noise according to the channel settings
	let imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
	let pixels = imageData.data;
	const LAST_EIGHT_BITS = 0b11111111;
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
}

function main(){
	let drop_zone = document.getElementById("drop_zone");
	drop_zone.addEventListener("drop", dragHandlers.drop);
	drop_zone.addEventListener("dragenter", dragHandlers.enter);
	drop_zone.addEventListener("dragleave", dragHandlers.leave);
	drop_zone.addEventListener("dragover", dragHandlers.over);
	drop_zone.addEventListener("dragend", dragHandlers.end);
	document.getElementById("get_image").addEventListener("change", changeHandler);
	document.getElementById("sent").addEventListener("load", imageChanged);
}

document.addEventListener("DOMContentLoaded", main);