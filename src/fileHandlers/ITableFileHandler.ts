// src/fileHandlers/ITableFileHandler.ts
import { TFile } from 'obsidian';
import { TableData } from '../types';

/**
 * Interface defining the contract for reading and writing table data
 * from different file formats.
 */
export interface ITableFileHandler {
  /**
   * Reads the file content and parses it into TableData.
   * @param file The TFile object to read.
   * @returns A Promise resolving to the TableData object.
   * @throws An error if reading or parsing fails.
   */
  read(file: TFile): Promise<TableData>;

  /**
   * Serializes the TableData and saves it to the specified file.
   * @param file The TFile object to write to.
   * @param data The TableData object to save.
   * @returns A Promise that resolves when saving is complete.
   * @throws An error if serialization or writing fails.
   */
  save(file: TFile, data: TableData): Promise<void>;
}