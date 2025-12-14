"""
Сервис для оптимизированной обработки Excel файлов
Поддерживает streaming для больших файлов и батчевую обработку
"""
import pandas as pd
from typing import List, Dict, Optional, Tuple
from sqlalchemy.orm import Session
from decimal import Decimal
from datetime import datetime
from app.logger import logger
# Импортируем функции из основного модуля services (не из папки services/)
from app import services as app_services


class ExcelProcessor:
    """
    Процессор для обработки Excel файлов с оптимизацией для больших файлов
    """
    
    # Размер батча для обработки
    BATCH_SIZE = 1000
    
    def __init__(self, db: Session):
        self.db = db
    
    def process_file(
        self,
        file_path: str,
        file_name: str,
        provider_id: Optional[int] = None,
        template_id: Optional[int] = None,
        chunk_size: Optional[int] = None
    ) -> List[Dict]:
        """
        Обработка Excel файла с поддержкой chunked reading для больших файлов
        
        Args:
            file_path: Путь к файлу
            file_name: Имя файла
            provider_id: ID провайдера
            template_id: ID шаблона
            chunk_size: Размер чанка для чтения (None = читать весь файл)
        
        Returns:
            Список транзакций
        """
        try:
            # Определяем маппинг полей и маппинг видов топлива
            field_mapping, header_row, data_start_row, fuel_type_mapping = self._get_field_mapping(
                file_path, template_id
            )
            
            # Читаем файл по частям, если указан chunk_size
            if chunk_size:
                return self._process_file_chunked(
                    file_path, file_name, field_mapping, header_row, 
                    data_start_row, provider_id, chunk_size, fuel_type_mapping
                )
            else:
                return self._process_file_full(
                    file_path, file_name, field_mapping, header_row,
                    data_start_row, provider_id, fuel_type_mapping
                )
        except Exception as e:
            logger.error(f"Ошибка обработки Excel файла: {file_path}", extra={"error": str(e)}, exc_info=True)
            raise
    
    def _get_field_mapping(
        self,
        file_path: str,
        template_id: Optional[int] = None
    ) -> Tuple[Dict, int, int, Optional[Dict]]:
        """
        Получение маппинга полей из шаблона или автоматический анализ
        Возвращает: (field_mapping, header_row, data_start_row, fuel_type_mapping)
        """
        import json
        from app.models import ProviderTemplate
        
        field_mapping = {}
        header_row = -1
        data_start_row = 1
        fuel_type_mapping = None
        
        if template_id:
            template = self.db.query(ProviderTemplate).filter(
                ProviderTemplate.id == template_id,
                ProviderTemplate.is_active == True
            ).first()
            
            if template:
                try:
                    field_mapping = json.loads(template.field_mapping) if isinstance(template.field_mapping, str) else template.field_mapping
                    header_row = template.header_row
                    data_start_row = template.data_start_row
                    
                    # Получаем маппинг видов топлива из шаблона
                    if template.fuel_type_mapping:
                        fuel_type_mapping = json.loads(template.fuel_type_mapping) if isinstance(template.fuel_type_mapping, str) else template.fuel_type_mapping
                except Exception as e:
                    logger.warning(f"Ошибка чтения шаблона: {e}", extra={"template_id": template_id})
        
        # Если шаблон не найден, используем автоматический анализ
        if not field_mapping:
            analysis = app_services.analyze_template_structure(file_path)
            field_mapping = analysis["field_mapping"]
            header_row = analysis["header_row"]
            data_start_row = analysis["data_start_row"]
        
        return field_mapping, header_row, data_start_row, fuel_type_mapping
    
    def _process_file_full(
        self,
        file_path: str,
        file_name: str,
        field_mapping: Dict,
        header_row: int,
        data_start_row: int,
        provider_id: Optional[int],
        fuel_type_mapping: Optional[Dict] = None
    ) -> List[Dict]:
        """
        Обработка всего файла целиком (для небольших файлов)
        """
        df = pd.read_excel(file_path, header=None, engine="openpyxl")
        return self._process_dataframe(
            df, file_name, field_mapping, header_row, 
            data_start_row, provider_id, fuel_type_mapping
        )
    
    def _process_file_chunked(
        self,
        file_path: str,
        file_name: str,
        field_mapping: Dict,
        header_row: int,
        data_start_row: int,
        provider_id: Optional[int],
        chunk_size: int,
        fuel_type_mapping: Optional[Dict] = None
    ) -> List[Dict]:
        """
        Обработка файла по частям (для больших файлов)
        """
        all_transactions = []
        
        # Читаем заголовки отдельно
        header_df = pd.read_excel(
            file_path, 
            header=None, 
            nrows=header_row + 1,
            engine="openpyxl"
        )
        
        # Определяем индексы колонок
        column_indices = self._get_column_indices(header_df.iloc[header_row], field_mapping)
        
        # Читаем данные по частям
        skip_rows = data_start_row
        chunk_num = 0
        
        while True:
            try:
                # Читаем чанк данных
                chunk_df = pd.read_excel(
                    file_path,
                    header=None,
                    skiprows=skip_rows,
                    nrows=chunk_size,
                    engine="openpyxl"
                )
                
                if chunk_df.empty:
                    break
                
                # Обрабатываем чанк
                chunk_transactions = self._process_dataframe_chunk(
                    chunk_df, file_name, column_indices, provider_id, fuel_type_mapping
                )
                all_transactions.extend(chunk_transactions)
                
                chunk_num += 1
                logger.debug(
                    f"Обработан чанк {chunk_num}",
                    extra={
                        "chunk_num": chunk_num,
                        "transactions_in_chunk": len(chunk_transactions),
                        "total_transactions": len(all_transactions)
                    }
                )
                
                # Если прочитали меньше записей, чем запрашивали - это последний чанк
                if len(chunk_df) < chunk_size:
                    break
                
                skip_rows += chunk_size
                
            except Exception as e:
                logger.error(f"Ошибка обработки чанка {chunk_num}", extra={"error": str(e)}, exc_info=True)
                break
        
        return all_transactions
    
    def _get_column_indices(self, header_row: pd.Series, field_mapping: Dict) -> Dict[str, int]:
        """
        Определение индексов колонок по маппингу
        """
        header_row_data = [str(cell).lower().strip() if pd.notna(cell) else "" for cell in header_row.values]
        
        def get_column_index(field_name: str) -> int:
            if field_name in field_mapping:
                mapping_value = field_mapping[field_name].lower()
                for i, cell in enumerate(header_row_data):
                    if mapping_value in cell or cell in mapping_value:
                        return i
            
            # Fallback: поиск по ключевым словам
            keywords_map = {
                "user": ["пользователь", "тс", "закреплена за"],
                "card": ["номер карты", "карты", "карта"],
                "kazs": ["казс", "азс", "номер азс"],
                "date": ["дата", "дата и время"],
                "quantity": ["кол-во", "количество", "литры"],
                "fuel": ["вид топлива", "топливо", "товар"],
                "organization": ["организация", "орг"]
            }
            
            if field_name in keywords_map:
                keywords = keywords_map[field_name]
                for i, cell in enumerate(header_row_data):
                    if any(kw.lower() in cell for kw in keywords):
                        return i
            
            return -1
        
        return {
            "org": get_column_index("organization"),
            "user": get_column_index("user"),
            "card": get_column_index("card"),
            "kazs": get_column_index("kazs"),
            "date": get_column_index("date"),
            "quantity": get_column_index("quantity"),
            "fuel": get_column_index("fuel")
        }
    
    def _process_dataframe(
        self,
        df: pd.DataFrame,
        file_name: str,
        field_mapping: Dict,
        header_row: int,
        data_start_row: int,
        provider_id: Optional[int],
        fuel_type_mapping: Optional[Dict] = None
    ) -> List[Dict]:
        """
        Обработка DataFrame с транзакциями
        """
        column_indices = self._get_column_indices(df.iloc[header_row], field_mapping)
        return self._process_dataframe_chunk(
            df.iloc[data_start_row:], file_name, column_indices, provider_id, fuel_type_mapping
        )
    
    def _process_dataframe_chunk(
        self,
        df: pd.DataFrame,
        file_name: str,
        column_indices: Dict[str, int],
        provider_id: Optional[int],
        fuel_type_mapping: Optional[Dict] = None
    ) -> List[Dict]:
        """
        Обработка части DataFrame
        """
        transactions = []
        
        date_idx = column_indices.get("date", -1)
        qty_idx = column_indices.get("quantity", -1)
        fuel_idx = column_indices.get("fuel", -1)
        
        if date_idx == -1 or qty_idx == -1 or fuel_idx == -1:
            raise ValueError("Не найдены обязательные колонки: Дата, Кол-во, Вид топлива")
        
        for i, row in df.iterrows():
            # Пропускаем пустые строки
            if pd.isna(row.iloc[date_idx]):
                continue
            
            # Получаем значения
            date_value = app_services.parse_excel_date(row.iloc[date_idx])
            if not date_value:
                continue
            
            qty_value = app_services.convert_to_decimal(row.iloc[qty_idx])
            if not qty_value:
                continue
            
            user_idx = column_indices.get("user", -1)
            card_idx = column_indices.get("card", -1)
            kazs_idx = column_indices.get("kazs", -1)
            org_idx = column_indices.get("org", -1)
            
            user = str(row.iloc[user_idx]).strip() if user_idx >= 0 and not pd.isna(row.iloc[user_idx]) else ""
            card = str(row.iloc[card_idx]).strip() if card_idx >= 0 and not pd.isna(row.iloc[card_idx]) else ""
            kazs = str(row.iloc[kazs_idx]).strip() if kazs_idx >= 0 and not pd.isna(row.iloc[kazs_idx]) else ""
            fuel = str(row.iloc[fuel_idx]).strip() if fuel_idx >= 0 and not pd.isna(row.iloc[fuel_idx]) else ""
            org = str(row.iloc[org_idx]).strip() if org_idx >= 0 and not pd.isna(row.iloc[org_idx]) else ""
            
            # Нормализуем вид топлива с использованием маппинга из шаблона
            normalized_fuel = fuel
            if fuel and fuel_type_mapping:
                # Ищем точное совпадение (регистронезависимо)
                fuel_lower = fuel.strip().lower()
                for source_name, target_name in fuel_type_mapping.items():
                    if source_name.strip().lower() == fuel_lower:
                        normalized_fuel = target_name
                        break
                # Если точного совпадения нет, используем стандартную нормализацию
                if normalized_fuel == fuel:
                    normalized_fuel = app_services.normalize_fuel(fuel)
            elif fuel:
                # Используем стандартную нормализацию, если маппинга нет
                normalized_fuel = app_services.normalize_fuel(fuel)
            
            transaction_data = {
                "transaction_date": date_value,
                "card_number": card,
                "vehicle": user,
                "azs_number": app_services.extract_azs_number(kazs),
                "azs_original_name": kazs,  # Сохраняем оригинальное название АЗС для создания записи в справочнике
                "product": normalized_fuel,
                "operation_type": "Покупка",
                "quantity": qty_value,
                "currency": "RUB",
                "exchange_rate": Decimal("1"),
                "source_file": file_name,
                "organization": org,
                "provider_id": provider_id
            }
            
            transactions.append(transaction_data)
        
        return transactions
