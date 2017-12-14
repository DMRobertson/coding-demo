"use strict"

class WorkerPool {
	constructor(size){
		this.size = size;
		this.workers = new Array(this.size);
		for (let i = 0; i < this.size; i++){
			this.workers[i] = new Worker("compute.js");
		}
	}
	
	simulateNoise(bytes, callback){
		for (let i = 0; i < this.size; i++){
			console.log("posting to " + i.toString() );
			this.workers[i].postMessage("hello " + i.toString());
		}
	}
}
var workers = new WorkerPool(4);

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
		error_probability: 0.15,
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
	let canvas = document.querySelector("canvas");
	let ctx = canvas.getContext("2d", {alpha: false});
	let success = paintImageOnCanvas(this, canvas, ctx);
	if (!success){
		return;
	}
	
	let imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
	workers.simulateNoise(data, function(){
		applyNoise(imageData, canvas, ctx);
	});
}

function applyNoise(imageData, canvas, ctx){
	ctx.putImageData(imageData, 0, 0);
	document.getElementById('received').src = canvas.toDataURL();
	document.getElementById('Bob').classList.remove("recomputing");
	document.getElementById("Bob").classList.remove("out_of_date");
}

function paintImageOnCanvas(image, canvas, ctx){
	if (image.naturalWidth === 0 || image.naturalHeight === 0){
		return false;
	}
	document.getElementById("Bob").classList.add("recomputing");
	// Setup canvas to be the static image
	let overscale = Math.max(1, image.naturalWidth/600, image.naturalHeight/600);
	canvas.width = Math.ceil(image.naturalWidth/overscale);
	canvas.height = Math.ceil(image.naturalHeight/overscale);
	ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
	return true;
}

function main(){
	/* renderMathInElement(document.body, {
		delimiters: [ {
			left: "$",
			right: "$",
			display: false
		} ]
	});
	*/
	
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
	errorProbabilityMoved.call(probability_slider);
}

document.addEventListener("DOMContentLoaded", main);
