import { Injectable } from '@angular/core';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

@Injectable({
  providedIn: 'root'
})
export class ExportService {

  constructor() { }

  /**
   * Exports data to an Excel file (.xlsx)
   * @param data Array of objects representing the rows
   * @param fileName Name of the output file (without extension)
   * @param sheetName Name of the sheet inside the Excel file
   */
  exportToExcel(data: any[], fileName: string, sheetName: string = 'Sheet1'): void {
    const ws: XLSX.WorkSheet = XLSX.utils.json_to_sheet(data);
    const wb: XLSX.WorkBook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, `${fileName}.xlsx`);
  }

  /**
   * Exports data to a PDF file
   * @param data Array of objects representing the rows
   * @param headers Array of column headers
   * @param columns Array of data keys matching the headers
   * @param fileName Name of the output file (without extension)
   * @param title Title to display at the top of the PDF
   * @param subtitle Optional subtitle
   */
  exportToPdf(
    data: any[],
    headers: string[],
    columns: string[],
    fileName: string,
    title: string,
    subtitle?: string
  ): void {
    const doc = new jsPDF('landscape'); // Landscape is usually better for tables

    // Colors
    const primaryColor: [number, number, number] = [79, 70, 229]; // Indigo-600
    const textColor: [number, number, number] = [51, 65, 85]; // Slate-700

    // Title
    doc.setFontSize(18);
    doc.setTextColor(...primaryColor);
    doc.text(title, 14, 22);

    // Subtitle
    if (subtitle) {
      doc.setFontSize(11);
      doc.setTextColor(...textColor);
      doc.text(subtitle, 14, 30);
    }

    // Prepare table data
    const tableData = data.map(row => columns.map(col => row[col] || ''));

    // Generate Table
    autoTable(doc, {
      head: [headers],
      body: tableData,
      startY: subtitle ? 36 : 28,
      theme: 'grid',
      styles: {
        fontSize: 9,
        cellPadding: 4,
        textColor: [51, 65, 85],
        font: 'helvetica'
      },
      headStyles: {
        fillColor: primaryColor,
        textColor: [255, 255, 255],
        fontStyle: 'bold'
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252] // Slate-50
      }
    });

    // Footer
    const pageCount = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184); // Slate-400
      const footerText = `Généré par WeenTime - Page ${i}/${pageCount}`;
      const x = doc.internal.pageSize.width / 2;
      const y = doc.internal.pageSize.height - 10;
      doc.text(footerText, x, y, { align: 'center' });
    }

    doc.save(`${fileName}.pdf`);
  }
}
