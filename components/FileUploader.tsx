import React, { FC } from 'react';

interface FileUploaderProps {
    onFileUpload: (file: File) => void;
    isLoading: boolean;
    disabled: boolean;
}

export const FileUploader: FC<FileUploaderProps> = ({ onFileUpload, isLoading, disabled }) => {
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            onFileUpload(e.target.files[0]);
        }
    };

    const handleDrop = (e: React.DragEvent<HTMLLabelElement>) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            onFileUpload(e.dataTransfer.files[0]);
        }
    };

    const handleDragOver = (e: React.DragEvent<HTMLLabelElement>) => {
        e.preventDefault();
        e.stopPropagation();
    };

    return (
        <div className="w-full">
            <label
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                className={`flex flex-col items-center justify-center text-center px-4 py-10 bg-white text-blue rounded-lg shadow-lg tracking-wide uppercase border-2 border-dashed  cursor-pointer ${ disabled ? 'cursor-not-allowed opacity-50' : 'hover:bg-indigo-50 hover:border-indigo-500'}`}
                htmlFor="file-upload"
            >
                <svg className="w-12 h-12" fill="currentColor" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                    <path d="M16.88 9.1A4 4 0 0 1 16 17H5a5 5 0 0 1-1-9.9V7a3 3 0 0 1 4.52-2.59A4.98 4.98 0 0 1 17 8c0 .38-.04.74-.12 1.1zM11 11h3l-4 4-4-4h3v-4h2v4z" />
                </svg>
                <span className="mt-2 text-base leading-normal">SELECCIONA UN ARCHIVO PDF O DOCX</span>
                <span className="text-sm text-gray-500">o arrástralo aquí</span>
            </label>
            <input id="file-upload" type="file" className="hidden" accept=".pdf,.docx" onChange={handleFileChange} disabled={disabled} />
        </div>
    );
};
