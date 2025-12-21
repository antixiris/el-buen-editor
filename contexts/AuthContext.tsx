import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import {
    User,
    signInWithPopup,
    signOut,
    onAuthStateChanged
} from 'firebase/auth';
import { auth, googleProvider } from '@/services/firebase';

// Lista de usuarios autorizados
const ALLOWED_EMAILS: string[] = [
    'adadelmoralfernandez@gmail.com',
    'lanochedelfugitivo@gmail.com'
];

interface AuthContextType {
    user: User | null;
    loading: boolean;
    signInWithGoogle: () => Promise<void>;
    logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = (): AuthContextType => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth debe usarse dentro de un AuthProvider');
    }
    return context;
};

interface AuthProviderProps {
    children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);

    // Escuchar cambios en el estado de autenticación
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (user) {
                // Verificar si el usuario está autorizado
                const userEmail = user.email?.toLowerCase();
                if (!userEmail || !ALLOWED_EMAILS.includes(userEmail)) {
                    // Usuario no autorizado, cerrar sesión
                    await signOut(auth);
                    setUser(null);
                } else {
                    setUser(user);
                }
            } else {
                setUser(null);
            }
            setLoading(false);
        });

        // Limpiar el listener al desmontar
        return () => unsubscribe();
    }, []);

    // Iniciar sesión con Google (solo usuarios autorizados)
    const signInWithGoogle = async (): Promise<void> => {
        try {
            const result = await signInWithPopup(auth, googleProvider);
            const userEmail = result.user.email?.toLowerCase();

            // Verificar si el usuario está en la lista de autorizados
            if (!userEmail || !ALLOWED_EMAILS.includes(userEmail)) {
                // Cerrar sesión inmediatamente si no está autorizado
                await signOut(auth);
                throw new Error('UNAUTHORIZED');
            }
        } catch (error: any) {
            console.error('Error al iniciar sesión con Google:', error);

            // Manejar errores comunes
            if (error.message === 'UNAUTHORIZED') {
                throw new Error('Acceso denegado. Tu cuenta no está autorizada para usar esta aplicación.');
            } else if (error.code === 'auth/popup-closed-by-user') {
                throw new Error('Inicio de sesión cancelado');
            } else if (error.code === 'auth/popup-blocked') {
                throw new Error('El navegador bloqueó la ventana emergente. Permite las ventanas emergentes para este sitio.');
            } else {
                throw new Error('Error al iniciar sesión. Por favor, inténtalo de nuevo.');
            }
        }
    };

    // Cerrar sesión
    const logout = async (): Promise<void> => {
        try {
            await signOut(auth);
        } catch (error) {
            console.error('Error al cerrar sesión:', error);
            throw new Error('Error al cerrar sesión');
        }
    };

    const value: AuthContextType = {
        user,
        loading,
        signInWithGoogle,
        logout
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};
