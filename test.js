import { db } from "./firebase-config.js";

import {
  collection,
  addDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

async function testFirestore() {
  try {
    const docRef = await addDoc(
      collection(db, "test"),
      {
        name: "Hello Firebase",
        time: new Date()
      }
    );

    console.log("Document ID:", docRef.id);
  }
  catch(error){
    console.error(error);
  }
}

testFirestore();