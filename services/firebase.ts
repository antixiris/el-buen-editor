import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// Configuración de Firebase
const firebaseConfig = {
    apiKey: "AIzaSyBxX75k-a8i89hWjaNnM9wy5oaSH5nR2ok",
    authDomain: "el-buen-editor.firebaseapp.com",
    projectId: "el-buen-editor",
    storageBucket: "el-buen-editor.firebasestorage.app",
    messagingSenderId: "669316701252",
    appId: "1:669316701252:web:84c2d88744aa7ebba37011",
    measurementId: "G-HTRJ5GMETC"
};

// Inicializar Firebase
const app = initializeApp(firebaseConfig);

// Inicializar servicios
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();

// Configurar el proveedor de Google para que siempre pida seleccionar cuenta
googleProvider.setCustomParameters({
    prompt: 'select_account'
});

export default app;
