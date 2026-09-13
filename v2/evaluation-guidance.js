export const TANNER_SCALE={
  1:{label:'Necesita apoyo',detail:'Todavía necesita ayuda frecuente para mostrarlo.'},
  2:{label:'En proceso',detail:'Empieza a mostrarlo, pero todavía de forma irregular o con ayuda.'},
  3:{label:'Esperado',detail:'Lo muestra como esperamos para su edad y etapa.',confirmation:'✓ Va donde debe ir.'},
  4:{label:'Sólido',detail:'Lo muestra con autonomía y de forma consistente.'},
  5:{label:'Destacado',detail:'Muestra un nivel destacado para su etapa actual; no significa perfecto.'},
  none:{label:'Sin evidencia',detail:'Todavía no has visto suficiente para evaluarlo con seguridad.'}
};

export const TANNER_DIMENSIONS=[
  {key:'tecnica',name:'Técnica',claim:'Tengo herramientas',observations:['Controla el balón','Conduce','Pasa y golpea','Utiliza diferentes recursos técnicos','Sus recursos funcionan cuando aparece presión'],question:'¿Tiene las herramientas técnicas que esperamos para su etapa?'},
  {key:'inteligencia',name:'Juego',claim:'Entiendo y resuelvo',observations:['Mira antes de actuar','Entiende dónde ubicarse','Reconoce espacios','Se relaciona con compañeros','Identifica ventajas','Decide sin depender siempre del entrenador'],question:'¿Entiende lo que pasa y encuentra soluciones?'},
  {key:'intensidad',name:'Cuerpo',claim:'Puedo ejecutar',observations:['Coordinación y equilibrio','Movilidad y agilidad','Control corporal','Velocidad y fuerza funcional para jugar'],question:'¿Su cuerpo le permite ejecutar lo que quiere hacer jugando?',warning:'No confundas maduración temprana, tamaño o fuerza con mayor talento.'},
  {key:'mentalidad',name:'Mentalidad',claim:'No desaparezco',observations:['Cómo responde al error','Concentración y valentía','Competitividad y frustración','Autonomía','Capacidad de volver a la siguiente jugada'],question:'¿Cómo responde cuando el fútbol se pone difícil?'},
  {key:'valores',name:'Espíritu',claim:'Represento algo más grande que yo',observations:['Respeto y compañerismo','Responsabilidad y disciplina','Humildad y pertenencia','Comportamiento con equipo, rival y club'],question:'¿Su comportamiento representa lo que significa ser Tanner?'}
];

export const CATEGORY_GUIDANCE={
  T6:'Buscamos curiosidad, coordinación básica, disfrute del balón y primeras decisiones dentro del juego.',
  T8:'Buscamos que empiece a levantar la cabeza, reconocer espacios, ayudar a compañeros y encontrar soluciones sencillas.',
  T10:'Buscamos que conecte lo que observa con decisiones más autónomas y sostenga sus acciones cuando aparece presión.',
  T12:'Buscamos que interprete presión, espacio, compañeros y rival para resolver situaciones con mayor autonomía.'
};

export function categoryStage(value=''){
  const match=String(value).toUpperCase().match(/T\s*(6|8|10|12)/);
  return match?`T${match[1]}`:'Su etapa';
}

export function guidanceForCategory(value=''){
  const stage=categoryStage(value);
  return {stage,text:CATEGORY_GUIDANCE[stage]||'Observa lo que corresponde a su edad, experiencia y etapa actual; no lo compares con sus compañeros.'};
}

export const EVALUATION_ONBOARDING=[
  {title:'Evalúa su etapa, no a sus compañeros',body:'Piensa en lo que esperamos de un Tanner de su edad y categoría. No lo compares con el mejor niño del equipo.'},
  {title:'3 es lo esperado',body:'Un 3 significa que va exactamente donde debe ir. No es una mala calificación: es la base correcta para su etapa.',scale:true},
  {title:'Evalúa lo que realmente has visto',body:'Piensa en varias semanas de entrenamiento y partido, no solamente en la última jugada.',evidence:true}
];
