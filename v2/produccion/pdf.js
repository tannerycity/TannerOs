/* El PDF de la hoja de producción, sin pantalla (22/10/2026).

   Lo arma Producción y también la Tienda al mandar el corte del viernes: el
   club lo comparte por WhatsApp Business desde el teléfono. Se sacó de
   /v2/produccion/app.js tal cual, para que los dos digan lo mismo. */
import { hojaPorModelo, filaDeHoja, resumenDeTallas, COLUMNAS_HOJA, nombreDeArchivoHoja } from '/v2/produccion/hoja.js';

function dateFmt(v){if(!v)return '—';const raw=String(v),d=raw.length<=10?new Date(`${raw}T12:00:00`):new Date(raw);return new Intl.DateTimeFormat('es-MX',{dateStyle:'medium'}).format(d);}

export async function hojaPdf({sheet,orgName}){
    const b=sheet.batch,grupos=hojaPorModelo(sheet.items||[]);
    const {jsPDF}=await import('https://esm.sh/jspdf@2.5.2');
    const doc=new jsPDF({unit:'pt',format:'letter',orientation:'landscape'});
    const ancho=doc.internal.pageSize.getWidth(),alto=doc.internal.pageSize.getHeight();
    const margen=32;let y=margen;
    const hoy=new Intl.DateTimeFormat('es-MX',{dateStyle:'long',timeStyle:'short'}).format(new Date());

    doc.setFont('helvetica','bold');doc.setFontSize(15);doc.setTextColor(7,25,30);
    doc.text('Hoja de producción',margen,y);y+=17;
    doc.setFont('helvetica','normal');doc.setFontSize(9);doc.setTextColor(100,118,123);
    doc.text(`${orgName||''} · corte ${b.folio} · proveedor ${b.supplierName||'sin asignar'}`,margen,y);y+=12;
    doc.text(`Enviado ${dateFmt(b.submittedOn)} · generado el ${hoy}`,margen,y);y+=16;
    if(b.notes){doc.setTextColor(7,25,30);doc.text(doc.splitTextToSize(`Notas: ${b.notes}`,ancho-margen*2),margen,y);y+=14;}

    const espacio=n=>{ if(y+n>alto-margen-24){doc.addPage();y=margen;} };
    for(const g of grupos){
      espacio(64);
      y+=8;
      doc.setFont('helvetica','bold');doc.setFontSize(11);doc.setTextColor(7,25,30);
      doc.text(g.modelo,margen,y);
      doc.setFont('helvetica','normal');doc.setFontSize(8);doc.setTextColor(120,132,136);
      doc.text(`${g.piezas} pieza${g.piezas===1?'':'s'}`,ancho-margen,y,{align:'right'});
      y+=12;
      // El resumen de corte: lo que el maquilador mira antes que los nombres.
      const tallas=resumenDeTallas(g);
      if(tallas.length){
        doc.setFontSize(8);doc.setTextColor(90,105,110);
        doc.text(tallas.map(t=>`${t.cantidad} ${t.etiqueta}`).join('   ·   '),margen,y);
        y+=12;
      }
      const cabecera=()=>{
        doc.setFillColor(31,78,96);doc.rect(margen,y-9,ancho-margen*2,15,'F');
        doc.setFont('helvetica','bold');doc.setFontSize(7.5);doc.setTextColor(255,255,255);
        let x=margen+4;
        for(const c of COLUMNAS_HOJA){doc.text(c.titulo,x,y+1);x+=c.ancho;}
        y+=17;doc.setTextColor(7,25,30);doc.setFont('helvetica','normal');doc.setFontSize(8);
      };
      cabecera();
      let rayado=false;
      g.renglones.forEach((r,i)=>{
        const f=filaDeHoja(r,i);
        // Los comentarios (y la nota del pedido) se leen completos: el renglón
        // crece lo que haga falta en vez de cortarlos en la primera línea.
        const celdas=COLUMNAS_HOJA.map(c=>c.clave==='status'?['']:(c.clave==='comentarios'?doc.splitTextToSize(String(f[c.clave]??''),c.ancho-6):[doc.splitTextToSize(String(f[c.clave]??''),c.ancho-6)[0]||'']));
        const lineas=Math.max(1,...celdas.map(x=>x.length)),altoFila=4+lineas*9;
        if(y+altoFila>alto-margen-24){doc.addPage();y=margen;cabecera();rayado=false;}
        if(rayado){doc.setFillColor(247,250,249);doc.rect(margen,y-9,ancho-margen*2,altoFila,'F');}
        rayado=!rayado;
        let x=margen+4;
        COLUMNAS_HOJA.forEach((c,k)=>{
          if(c.clave==='manga'&&f.manga==='LARGA'){doc.setFont('helvetica','bold');doc.text(celdas[k],x,y);doc.setFont('helvetica','normal');}
          else doc.text(celdas[k],x,y);
          x+=c.ancho;
        });
        y+=altoFila;
      });
      y+=6;
    }

    const paginas=doc.internal.getNumberOfPages();
    for(let i=1;i<=paginas;i++){
      doc.setPage(i);doc.setFont('helvetica','normal');doc.setFontSize(7.5);doc.setTextColor(140,155,158);
      doc.text(`Página ${i} de ${paginas} · TannerOS`,ancho-margen,alto-16,{align:'right'});
    }
    return doc;
}

export function nombreDelPdf(sheet){return nombreDeArchivoHoja(sheet?.batch?.folio);}

// Compartir el PDF: en el teléfono abre la hoja de compartir (WhatsApp
// Business sale ahí); en la compu lo descarga. Devuelve cómo se fue.
export async function compartePdf(doc,nombre,texto){
  const blob=doc.output('blob'),archivo=new File([blob],nombre,{type:'application/pdf'});
  try{
    if(navigator.canShare&&navigator.canShare({files:[archivo]})){await navigator.share({files:[archivo],title:nombre,text:texto});return 'compartido';}
  }catch(e){if(e?.name==='AbortError')return 'cancelado';}
  doc.save(nombre);return 'descargado';
}
