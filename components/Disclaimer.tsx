import React, { FC } from 'react';

export const Disclaimer: FC = () => (
    <div className="mt-6 p-4 bg-yellow-100 border-l-4 border-yellow-500 text-yellow-800 text-sm">
        <h4 className="font-bold">INFORMACIÓN RELEVANTE:</h4>
        <ul className="list-disc list-inside mt-2 space-y-1">
            <li>Esta aplicación no está conectada a ninguna base de datos y no almacena información de los libros subidos.</li>
            <li>Las materias IBIC, BISAC y THEMA están confrontadas con listados vigentes almacenados en una base de conocimiento estática, es decir, son materias seleccionadas por la aplicación sobre listados oficiales y reales no inventados o especulados por la IA.</li>
            <li>La sinopsis es un texto generado por la IA a modo de propuesta inicial. Es responsabilidad del editor mejorarlo, adaptarlo o crear uno nuevo. Sirva solo como referencia.</li>
            <li>La biografía del autor, si no está detallada dentro del contenido del libro subido, es generada mediante un proceso de investigación que hace la IA en internet. Es posible, por tanto, que ofrezca datos inexactos, no contrastados o relativos a otra persona.</li>
        </ul>
        <h4 className="font-bold mt-4">ADVERTENCIA AL EDITOR</h4>
        <p className="mt-1">
            Esta aplicación es una herramienta dirigida a agilizar la obtención de datos para rellenar la ficha del libro en el gestor y tiene un valor meramente consultivo y funcional. El editor es responsable directo de la información que vierte en el gestor, principal base de trabajo del equipo editorial.
        </p>
    </div>
);
