import {
    collection,
    addDoc,
    query,
    orderBy,
    limit,
    getDocs,
    Timestamp
} from 'firebase/firestore';
import { db } from './firebase';

// Nombre de la colección en Firestore
const COLLECTION_NAME = 'activity_log';

export interface ActivityLogEntry {
    id?: string;
    title: string;
    authorName: string;
    userEmail: string;
    userName: string;
    timestamp: Date;
    wordCount: number;
}

interface FirestoreActivityLog {
    title: string;
    authorName: string;
    userEmail: string;
    userName: string;
    timestamp: Timestamp;
    wordCount: number;
}

/**
 * Registra una nueva entrada de actividad cuando se analiza un libro
 */
export const logBookAnalysis = async (
    title: string,
    authorName: string,
    wordCount: number,
    userEmail: string,
    userName: string
): Promise<void> => {
    try {
        await addDoc(collection(db, COLLECTION_NAME), {
            title,
            authorName,
            userEmail,
            userName,
            wordCount,
            timestamp: Timestamp.now()
        });
        console.log('Actividad registrada:', title);
    } catch (error) {
        console.error('Error al registrar actividad:', error);
        // No lanzamos el error para no interrumpir el flujo principal
    }
};

/**
 * Obtiene las últimas entradas del registro de actividad
 */
export const getActivityLog = async (limitCount: number = 50): Promise<ActivityLogEntry[]> => {
    try {
        const q = query(
            collection(db, COLLECTION_NAME),
            orderBy('timestamp', 'desc'),
            limit(limitCount)
        );

        const querySnapshot = await getDocs(q);
        const entries: ActivityLogEntry[] = [];

        querySnapshot.forEach((doc) => {
            const data = doc.data() as FirestoreActivityLog;
            entries.push({
                id: doc.id,
                title: data.title,
                authorName: data.authorName,
                userEmail: data.userEmail,
                userName: data.userName,
                wordCount: data.wordCount,
                timestamp: data.timestamp.toDate()
            });
        });

        return entries;
    } catch (error) {
        console.error('Error al obtener registro de actividad:', error);
        return [];
    }
};

/**
 * Formatea la fecha para mostrar
 */
export const formatActivityDate = (date: Date): string => {
    return new Intl.DateTimeFormat('es-ES', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    }).format(date);
};
