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
			loadFile(DTGetFile(e.dataTransfer), this);
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

function loadFile(file, dropZone){
	let fr = new FileReader();
	fr.onload = function () {
		document.getElementById('original').src = fr.result;
	}
	fr.readAsDataURL(file);
}




function main(){
	let sent = document.getElementById("sent");
	sent.addEventListener("drop", dragHandlers.drop);
	sent.addEventListener("dragenter", dragHandlers.enter);
	sent.addEventListener("dragleave", dragHandlers.leave);
	sent.addEventListener("dragover", dragHandlers.over);
	sent.addEventListener("dragend", dragHandlers.end);
	document.getElementById("get_image").addEventListener("change", changeHandler);
}

document.addEventListener("DOMContentLoaded", main);