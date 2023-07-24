require('dotenv').config();
console.log(process.env.DB_HOST, process.env.DB_USER, process.env.DB_PASSWORD, process.env.DB_NAME);

const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const mysql = require('mysql2');
const mercadopago = require('mercadopago');
const axios = require('axios');
const bodyParser = require('body-parser');

const app = express();

const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  connectionLimit: 10,
});

db.getConnection((err, connection) => {
  if (err) throw err;
  console.log('Conectado ao banco de dados MySQL');
  connection.release();
});

db.getConnection((err, connection) => {
  if (err) throw err;
  console.log('Conectado ao banco de dados MySQL');
  connection.query(
    "CREATE TABLE IF NOT EXISTS cadastro_clientes (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(255), surname VARCHAR(255), email VARCHAR(255), birthDate DATE, gender VARCHAR(10), phone VARCHAR(20), phone2 VARCHAR(20), cpf VARCHAR(14), cnpj VARCHAR(18), registration VARCHAR(255), obs TEXT, address VARCHAR(255), number VARCHAR(10), complement VARCHAR(255), district VARCHAR(255), city VARCHAR(255), state VARCHAR(255), country VARCHAR(255), zipCode VARCHAR(10), unit VARCHAR(255), sector VARCHAR(255), role VARCHAR(255), institution VARCHAR(255), accessRecovery BOOLEAN, access VARCHAR(50))",
    (err, result) => {
      if (err) throw err;
      console.log('Tabela "cadastro_clientes" verificada/criada');
    }
  );
  connection.release();
});

app.use(cors());
app.use(express.json());

app.post('/register', (req, res) => {
  const {
    name,
    surname,
    email,
    birthDate,
    gender,
    phone,
    phone2,
    cpf,
    cnpj,
    registration,
    obs,
    address,
    number,
    complement,
    district,
    city,
    state,
    country,
    zipCode,
    unit,
    sector,
    role,
    institution,
    accessRecovery,
    access, 
  } = req.body;

  const query =
    'INSERT INTO cadastro_clientes (name, surname, email, birthDate, gender, phone, phone2, cpf, cnpj, registration, obs, address, number, complement, district, city, state, country, zipCode, unit, sector, role, institution, accessRecovery) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
  const values = [
    name,
    surname,
    email,
    birthDate,
    gender,
    phone,
    phone2,
    cpf,
    cnpj,
    registration,
    obs,
    address,
    number,
    complement,
    district,
    city,
    state,
    country,
    zipCode,
    unit,
    sector,
    role,
    institution,
    accessRecovery,
    access, 
  ];

  db.query(query, values, (err, result) => {
    if (err) {
      console.log(err);
      return res.send({ success: false, message: err.message });
    }
    res.send({ success: true });
  });         
});


// Buscar todos os usuários
app.get('/users', (req, res) => {
  const query = 'SELECT * FROM cadastro_clientes';
  db.query(query, (err, results) => {
    if (err) {
      console.log(err);
      return res.send({ success: false, message: err.message });
    }
    res.send({ success: true, users: results });
  });
});

// Buscar um usuário específico pelo seu ID
app.get('/users/:id', (req, res) => {
  const { id } = req.params;
  const query = 'SELECT * FROM cadastro_clientes WHERE id = ?';
  db.query(query, [id], (err, results) => {
    if (err) {
      console.log(err);
      return res.send({ success: false, message: err.message });
    }
    if (results.length === 0) {
      return res.send({ success: false, message: 'User not found' });
    }
    res.send({ success: true, user: results[0] });
  });
});

// Atualizar um usuário
app.put('/cadastro_clientes/:id', (req, res) => {
  const { id } = req.params;
  const {
    name,
    surname,
    email,
    birthDate,
    gender,
    phone,
    phone2,
    cpf,
    cnpj,
    registration,
    obs,
    address,
    number,
    complement,
    district,
    city,
    state,
    country,
    zipCode,
    unit,
    sector,
    role,
    institution,
    accessRecovery,
    access,  // Adicionado aqui
  } = req.body;

  const query =
    'UPDATE cadastro_clientes SET name = ?, surname = ?, email = ?, birthDate = ?, gender = ?, phone = ?, phone2 = ?, cpf = ?, cnpj = ?, registration = ?, obs = ?, address = ?, number = ?, complement = ?, district = ?, city = ?, state = ?, country = ?, zipCode = ?, unit = ?, sector = ?, role = ?, institution = ?, accessRecovery = ?, access = ? WHERE id = ?';  // Adicionado aqui

  const values = [
    name,
    surname,
    email,
    birthDate,
    gender,
    phone,
    phone2,
    cpf,
    cnpj,
    registration,
    obs,
    address,
    number,
    complement,
    district,
    city,
    state,
    country,
    zipCode,
    unit,
    sector,
    role,
    institution,
    accessRecovery,
    access,  // Adicionado aqui
    id,
  ];

  db.query(query, values, (err, result) => {
    if (err) {
      console.log(err);
      return res.send({ success: false, message: err.message });
    }
    res.send({ success: true });
  });
});


// Excluir um usuário
app.delete('/users/:id', (req, res) => {
  const { id } = req.params;
  const query = 'DELETE FROM cadastro_clientes WHERE id = ?';
  db.query(query, [id], (err, result) => {
    if (err) {
      console.log(err);
      return res.send({ success: false, message: err.message });
    }
    if (result.affectedRows === 0) {
      return res.send({ success: false, message: 'User not found' });
    }
    res.send({ success: true, message: `User with ID ${id} deleted` });
  });
});

app.post('/login', (req, res) => {
  const { usuario, senha } = req.body;

  const query = 'SELECT * FROM cadastro WHERE usuario = ?';
  db.query(query, [usuario], (err, results) => {
    if (err || results.length === 0) {
      return res.send({ success: false, message: 'User not found' });
    }

    const user = results[0];

    const isMatch = bcrypt.compareSync(senha, user.senha);
    if (!isMatch) {
      return res.send({ success: false, message: 'Wrong password' });
    }

    const token = jwt.sign({ id: user.id, role: user.acesso }, process.env.JWT_SECRET, { expiresIn: '1h' });
    res.cookie('token', token, { httpOnly: true });
    
    res.send({ success: true, username: user.usuario, role: user.acesso, token });
  });
});

app.delete('/deleteAll', (req, res) => {
  const query = 'DELETE FROM cadastro_clientes';
  db.query(query, (err, result) => {
    if (err) {
      console.log(err);
      return res.send({ success: false, message: 'Falha ao excluir registros: ' + err.message });
    }

    if (result.affectedRows > 0) {
      res.send({ success: true, message: `${result.affectedRows} registro(s) foram excluídos.` });
    } else {
      res.send({ success: false, message: 'Não há registros para excluir.' });
    }
  });
});

app.use((req, res, next) => {
  // Se não há token na requisição, passe para a próxima rota
  if (!req.headers.authorization) return next();

  // Decodificar o token
  const token = req.headers.authorization.split(' ')[1];
  try {
    const payload = jwt.verify(token, 'suus02201998##');
    req.user = payload;
  } catch (error) {
    console.log('Error decoding JWT: ', error);
  }

  next();
});

const protectedRoutes = [
  { url: '/deleteAll', methods: ['DELETE'], roles: ['admin'] },
  // Adicione outras rotas protegidas aqui
];

app.use((req, res, next) => {
  if (!req.user) return next();

  const protectedRoute = protectedRoutes.find(
    (route) => route.url === req.path && route.methods.includes(req.method)
  );

  if (protectedRoute && !protectedRoute.roles.includes(req.user.role)) {
    return res.status(403).json({ success: false, message: 'Forbidden' });
  }

  next();
});

const port = process.env.PORT || 5000;

app.listen(port, () => console.log(`Server is running on port ${port}`));
