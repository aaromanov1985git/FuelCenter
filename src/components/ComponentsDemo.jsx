import React, { useState } from 'react';
import {
  Button,
  Input,
  Select,
  Checkbox,
  Radio,
  Card,
  Badge,
  Modal,
  Table,
  Tooltip,
  Alert,
  useToast,
  Skeleton
} from './ui';
import './ComponentsDemo.css';

const ComponentsDemo = () => {
  const [modalOpen, setModalOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [selectValue, setSelectValue] = useState('');
  const [checkboxValue, setCheckboxValue] = useState(false);
  const [radioValue, setRadioValue] = useState('1');
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  const handleLoadingDemo = () => {
    setLoading(true);
    setTimeout(() => setLoading(false), 2000);
  };

  const providerOptions = [
    { value: '1', label: 'Газпром' },
    { value: '2', label: 'Лукойл' },
    { value: '3', label: 'Роснефть' },
    { value: '4', label: 'Татнефть' }
  ];

  return (
    <div className="demo-container">
      <h1>UI Компоненты - Демо</h1>
      <p className="demo-subtitle">Стандартизированные компоненты проекта ГСМ</p>

      {/* Tooltip Section */}
      <Card variant="elevated" padding="lg">
        <Card.Header>
          <Card.Title>Подсказки (Tooltip)</Card.Title>
        </Card.Header>
        <Card.Body>
          <div className="demo-section">
            <h3>Позиции</h3>
            <div className="demo-row" style={{ justifyContent: 'center', padding: '3rem' }}>
              <Tooltip content="Подсказка сверху" position="top">
                <Button variant="secondary">Сверху</Button>
              </Tooltip>
              <Tooltip content="Подсказка справа" position="right">
                <Button variant="secondary">Справа</Button>
              </Tooltip>
              <Tooltip content="Подсказка снизу" position="bottom">
                <Button variant="secondary">Снизу</Button>
              </Tooltip>
              <Tooltip content="Подсказка слева" position="left">
                <Button variant="secondary">Слева</Button>
              </Tooltip>
            </div>

            <h3>С различными элементами</h3>
            <div className="demo-row">
              <Tooltip content="Это основная кнопка для действий">
                <Button variant="primary">Кнопка с подсказкой</Button>
              </Tooltip>
              <Tooltip content="Введите ваш email адрес для регистрации">
                <Input placeholder="Email" icon="📧" />
              </Tooltip>
              <Tooltip content="Статус: всё в порядке">
                <Badge variant="success">Активен</Badge>
              </Tooltip>
            </div>

            <h3>Длинная подсказка</h3>
            <div className="demo-row">
              <Tooltip content="Это очень длинная подсказка, которая автоматически переносится на несколько строк для лучшей читаемости. Максимальная ширина составляет 300px.">
                <Button variant="ghost">Наведите для длинной подсказки</Button>
              </Tooltip>
            </div>
          </div>
        </Card.Body>
      </Card>

      {/* Alert Section */}
      <Card variant="elevated" padding="lg">
        <Card.Header>
          <Card.Title>Уведомления (Alert)</Card.Title>
        </Card.Header>
        <Card.Body>
          <div className="demo-section">
            <h3>Варианты</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <Alert variant="success" title="Успешно">
                Данные успешно сохранены в системе
              </Alert>
              <Alert variant="error" title="Ошибка">
                Не удалось загрузить данные. Проверьте соединение
              </Alert>
              <Alert variant="warning" title="Внимание">
                Убедитесь, что все поля заполнены корректно
              </Alert>
              <Alert variant="info" title="Информация">
                Новая версия системы будет доступна завтра
              </Alert>
            </div>

            <h3>Без заголовка</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <Alert variant="success">Операция выполнена</Alert>
              <Alert variant="info">Это простое информационное сообщение</Alert>
            </div>

            <h3>С закрытием</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <Alert variant="warning" title="Можно закрыть" closable onClose={() => console.log('Closed')}>
                Это уведомление можно закрыть
              </Alert>
            </div>
          </div>
        </Card.Body>
      </Card>

      {/* Buttons Section */}
      <Card variant="elevated" padding="lg">
        <Card.Header>
          <Card.Title>Кнопки (Button)</Card.Title>
        </Card.Header>
        <Card.Body>
          <div className="demo-section">
            <h3>Варианты</h3>
            <div className="demo-row">
              <Button variant="primary">Primary</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="success">Success</Button>
              <Button variant="error">Error</Button>
              <Button variant="warning">Warning</Button>
              <Button variant="ghost">Ghost</Button>
            </div>

            <h3>Размеры</h3>
            <div className="demo-row">
              <Button size="sm">Small</Button>
              <Button size="md">Medium</Button>
              <Button size="lg">Large</Button>
            </div>

            <h3>С иконками и состояниями</h3>
            <div className="demo-row">
              <Button icon="🔄" iconPosition="left">С иконкой</Button>
              <Button icon="→" iconPosition="right">Вперед</Button>
              <Button loading={loading} onClick={handleLoadingDemo}>
                {loading ? 'Загрузка...' : 'Загрузить'}
              </Button>
              <Button disabled>Disabled</Button>
            </div>
          </div>
        </Card.Body>
      </Card>

      {/* Inputs Section */}
      <Card variant="elevated" padding="lg">
        <Card.Header>
          <Card.Title>Поля ввода (Input)</Card.Title>
        </Card.Header>
        <Card.Body>
          <div className="demo-section">
            <div className="demo-grid">
              <Input
                label="Обычный текст"
                placeholder="Введите текст"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
              />

              <Input
                label="Email"
                type="email"
                placeholder="example@mail.com"
                helperText="Введите действительный email"
              />

              <Input
                label="Пароль"
                type="password"
                placeholder="Введите пароль"
              />

              <Input
                label="С ошибкой"
                error="Это поле обязательно"
                required
              />

              <Input
                label="С иконкой"
                icon="🔍"
                placeholder="Поиск..."
                fullWidth
              />
            </div>
          </div>
        </Card.Body>
      </Card>

      {/* Select Section */}
      <Card variant="elevated" padding="lg">
        <Card.Header>
          <Card.Title>Выпадающие списки (Select)</Card.Title>
        </Card.Header>
        <Card.Body>
          <div className="demo-section">
            <div className="demo-grid">
              <Select
                label="Простой Select"
                options={providerOptions}
                value={selectValue}
                onChange={setSelectValue}
                placeholder="Выберите поставщика"
              />

              <Select
                label="С поиском"
                options={providerOptions}
                value={selectValue}
                onChange={setSelectValue}
                searchable
                placeholder="Поиск поставщика"
              />

              <Select
                label="С очисткой"
                options={providerOptions}
                value={selectValue}
                onChange={setSelectValue}
                clearable
                placeholder="Можно очистить"
              />
            </div>
          </div>
        </Card.Body>
      </Card>

      {/* Checkbox & Radio Section */}
      <Card variant="elevated" padding="lg">
        <Card.Header>
          <Card.Title>Чекбоксы и радио (Checkbox, Radio)</Card.Title>
        </Card.Header>
        <Card.Body>
          <div className="demo-section">
            <h3>Чекбоксы</h3>
            <div className="demo-column">
              <Checkbox
                checked={checkboxValue}
                onChange={setCheckboxValue}
                label="Обычный чекбокс"
              />
              <Checkbox
                checked={true}
                onChange={() => {}}
                label="Отмеченный чекбокс"
              />
              <Checkbox
                checked={false}
                onChange={() => {}}
                disabled
                label="Заблокированный чекбокс"
              />
            </div>

            <h3>Радио кнопки</h3>
            <Radio.Group value={radioValue} onChange={setRadioValue} name="provider">
              <Radio value="1" label="Газпром" />
              <Radio value="2" label="Лукойл" />
              <Radio value="3" label="Роснефть" />
            </Radio.Group>
          </div>
        </Card.Body>
      </Card>

      {/* Badges Section */}
      <Card variant="elevated" padding="lg">
        <Card.Header>
          <Card.Title>Статусы (Badge)</Card.Title>
        </Card.Header>
        <Card.Body>
          <div className="demo-section">
            <h3>Варианты</h3>
            <div className="demo-row">
              <Badge variant="success">Валидный</Badge>
              <Badge variant="warning">На проверке</Badge>
              <Badge variant="error">Ошибка</Badge>
              <Badge variant="info">Информация</Badge>
              <Badge variant="neutral">Нейтральный</Badge>
            </div>

            <h3>С анимацией</h3>
            <div className="demo-row">
              <Badge variant="success" pulse>Активный</Badge>
              <Badge variant="error" pulse>Критичная ошибка</Badge>
            </div>

            <h3>Размеры</h3>
            <div className="demo-row">
              <Badge size="sm">Small</Badge>
              <Badge size="md">Medium</Badge>
              <Badge size="lg">Large</Badge>
            </div>
          </div>
        </Card.Body>
      </Card>

      {/* Cards Section */}
      <Card variant="elevated" padding="lg">
        <Card.Header>
          <Card.Title>Карточки (Card)</Card.Title>
        </Card.Header>
        <Card.Body>
          <div className="demo-section">
            <div className="demo-cards">
              <Card variant="default">
                <Card.Header>
                  <Card.Title>Default Card</Card.Title>
                </Card.Header>
                <Card.Body>Обычная карточка с границей</Card.Body>
              </Card>

              <Card variant="elevated" hoverable>
                <Card.Header>
                  <Card.Title>Elevated Card</Card.Title>
                  <Badge variant="success">Active</Badge>
                </Card.Header>
                <Card.Body>Карточка с тенью и hover эффектом</Card.Body>
                <Card.Footer>
                  <Button size="sm" variant="ghost">Подробнее →</Button>
                </Card.Footer>
              </Card>

              <Card variant="outlined">
                <Card.Header>
                  <Card.Title>Outlined Card</Card.Title>
                </Card.Header>
                <Card.Body>Карточка только с границей</Card.Body>
              </Card>
            </div>
          </div>
        </Card.Body>
      </Card>

      {/* Modal Section */}
      <Card variant="elevated" padding="lg">
        <Card.Header>
          <Card.Title>Модальное окно (Modal)</Card.Title>
        </Card.Header>
        <Card.Body>
          <div className="demo-section">
            <Button variant="primary" onClick={() => setModalOpen(true)}>
              Открыть модальное окно
            </Button>
          </div>
        </Card.Body>
      </Card>

      {/* Table Section */}
      <Card variant="elevated" padding="lg">
        <Card.Header>
          <Card.Title>Таблица (Table)</Card.Title>
        </Card.Header>
        <Card.Body>
          <div className="demo-section">
            <Table
              columns={[
                { key: 'id', header: 'ID', width: '80px', align: 'center' },
                { key: 'name', header: 'Название', sortable: true },
                { key: 'provider', header: 'Провайдер', sortable: true },
                {
                  key: 'status',
                  header: 'Статус',
                  render: (value) => (
                    <Badge
                      variant={value === 'active' ? 'success' : value === 'pending' ? 'warning' : 'neutral'}
                    >
                      {value === 'active' ? 'Активен' : value === 'pending' ? 'На проверке' : 'Неактивен'}
                    </Badge>
                  )
                },
                { key: 'amount', header: 'Сумма', align: 'right', sortable: true }
              ]}
              data={[
                { id: 1, name: 'АЗС №1', provider: 'Газпром', status: 'active', amount: '12,500' },
                { id: 2, name: 'АЗС №2', provider: 'Лукойл', status: 'pending', amount: '8,300' },
                { id: 3, name: 'АЗС №3', provider: 'Роснефть', status: 'active', amount: '15,700' },
                { id: 4, name: 'АЗС №4', provider: 'Газпром', status: 'inactive', amount: '0' },
                { id: 5, name: 'АЗС №5', provider: 'Татнефть', status: 'active', amount: '9,400' }
              ]}
              sortable
              hoverable
              striped
              defaultSortColumn="name"
              defaultSortOrder="asc"
            />

            <h3 style={{ marginTop: '2rem' }}>С пагинацией</h3>
            <Table
              columns={[
                { key: 'date', header: 'Дата', sortable: true },
                { key: 'vehicle', header: 'ТС', sortable: true },
                { key: 'fuel', header: 'Топливо' },
                { key: 'liters', header: 'Литры', align: 'right', sortable: true }
              ]}
              data={[
                { id: 1, date: '28.01.25', vehicle: 'А001АА', fuel: 'АИ-95', liters: '45.5' },
                { id: 2, date: '28.01.25', vehicle: 'В002ВВ', fuel: 'ДТ', liters: '120.0' },
                { id: 3, date: '27.01.25', vehicle: 'С003СС', fuel: 'АИ-92', liters: '38.2' }
              ]}
              compact
              hoverable
            />
            <Table.Pagination
              currentPage={1}
              totalPages={5}
              total={15}
              pageSize={3}
              onPageChange={(page) => console.log('Page:', page)}
              onPageSizeChange={(size) => console.log('Size:', size)}
            />
          </div>
        </Card.Body>
      </Card>

      {/* Toast Section */}
      <Card variant="elevated" padding="lg">
        <Card.Header>
          <Card.Title>Toast уведомления (Toast)</Card.Title>
        </Card.Header>
        <Card.Body>
          <div className="demo-section">
            <h3>Варианты</h3>
            <div className="demo-row">
              <Button variant="success" onClick={() => toast.success('Операция успешно выполнена')}>
                Success Toast
              </Button>
              <Button variant="error" onClick={() => toast.error('Произошла ошибка при сохранении данных')}>
                Error Toast
              </Button>
              <Button variant="warning" onClick={() => toast.warning('Внимание! Проверьте введённые данные')}>
                Warning Toast
              </Button>
              <Button variant="primary" onClick={() => toast.info('Новая версия доступна для обновления', 'Информация')}>
                Info Toast
              </Button>
            </div>

            <h3>С кастомными параметрами</h3>
            <div className="demo-row">
              <Button
                variant="ghost"
                onClick={() => toast.showToast({
                  variant: 'success',
                  title: 'Успех!',
                  message: 'Это уведомление будет показано 10 секунд',
                  duration: 10000
                })}
              >
                Длинное уведомление
              </Button>
              <Button
                variant="ghost"
                onClick={() => toast.showToast({
                  variant: 'info',
                  message: 'Это уведомление без кнопки закрытия',
                  closable: false,
                  duration: 3000
                })}
              >
                Без закрытия
              </Button>
            </div>
          </div>
        </Card.Body>
      </Card>

      {/* Skeleton Section */}
      <Card variant="elevated" padding="lg">
        <Card.Header>
          <Card.Title>Загрузочные плейсхолдеры (Skeleton)</Card.Title>
        </Card.Header>
        <Card.Body>
          <div className="demo-section">
            <h3>Базовые варианты</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <p style={{ marginBottom: '8px', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
                  Текст:
                </p>
                <Skeleton variant="text" width="100%" />
                <Skeleton variant="text" width="80%" />
                <Skeleton variant="text" width="60%" />
              </div>

              <div>
                <p style={{ marginBottom: '8px', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
                  Аватар:
                </p>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <Skeleton.Avatar size={40} />
                  <Skeleton.Avatar size={60} />
                  <Skeleton.Avatar size={80} />
                </div>
              </div>

              <div>
                <p style={{ marginBottom: '8px', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
                  Прямоугольник:
                </p>
                <Skeleton variant="rectangular" height={200} />
              </div>
            </div>

            <h3>Анимации</h3>
            <div style={{ display: 'flex', gap: '16px', flexDirection: 'column' }}>
              <div>
                <p style={{ marginBottom: '8px', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
                  Pulse (по умолчанию):
                </p>
                <Skeleton variant="rectangular" height={60} animation="pulse" />
              </div>
              <div>
                <p style={{ marginBottom: '8px', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
                  Wave:
                </p>
                <Skeleton variant="rectangular" height={60} animation="wave" />
              </div>
              <div>
                <p style={{ marginBottom: '8px', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
                  Без анимации:
                </p>
                <Skeleton variant="rectangular" height={60} animation="none" />
              </div>
            </div>

            <h3>Готовые шаблоны</h3>
            <div style={{ display: 'grid', gap: '24px' }}>
              <div>
                <p style={{ marginBottom: '8px', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
                  Карточка:
                </p>
                <Skeleton.Card />
              </div>

              <div>
                <p style={{ marginBottom: '8px', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
                  Список:
                </p>
                <Skeleton.List items={3} avatar={true} />
              </div>
            </div>
          </div>
        </Card.Body>
      </Card>

      {/* Modal Component */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Пример модального окна"
        size="md"
      >
        <Modal.Body>
          <p>Это модальное окно с focus trap и scroll lock.</p>
          <Input
            label="Поле в модалке"
            placeholder="Попробуйте Tab"
            fullWidth
          />
          <Select
            label="Select в модалке"
            options={providerOptions}
            placeholder="Выберите"
            fullWidth
          />
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setModalOpen(false)}>
            Отмена
          </Button>
          <Button variant="primary" onClick={() => setModalOpen(false)}>
            Сохранить
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Toast Container */}
      <toast.ToastContainer />
    </div>
  );
};

export default ComponentsDemo;
