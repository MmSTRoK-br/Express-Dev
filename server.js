require('dotenv').config();
console.log(process.env.DB_HOST, process.env.DB_USER, process.env.DB_PASSWORD, process.env.DB_NAME);

const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const mysql = require('mysql2');
const mercadopago = require('mercadopago');
const axios = require('axios');


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

app.use(cors());
app.use(express.json());

app.post('/register', (req, res) => {
  const { usuario, nome, email, senha, unidade, setor, acesso } = req.body;
  const hashedPassword = bcrypt.hashSync(senha, 10);

  const query = 'INSERT INTO cadastro (usuario, nome, email, senha, unidade, setor, acesso) VALUES (?, ?, ?, ?, ?, ?, ?)';
  db.query(query, [usuario, nome, email, hashedPassword, unidade, setor, acesso], (err, result) => {
    if (err) {
      console.log(err);
      return res.send({ success: false, message: err.message });
    }
    res.send({ success: true });
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

    res.send({ success: true, username: user.usuario, token });
  });
});

axios.post('/api/authenticate', {username, password})
  .then(response => {
    // A resposta da API vai depender do seu back-end. 
    // Normalmente, você terá um objeto de usuário como parte da resposta.
    const user = response.data;

    // Armazene a role no localStorage
    localStorage.setItem('role', user.role);

    // Continue com a lógica de autenticação...
  })
  .catch(error => {
    // Handle error...
  });

app.delete('/deleteAll', (req, res) => {
  const query = 'DELETE FROM cadastro';
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

app.post('/register', (req, res) => {
  const { usuario, nome, email, senha, unidade, setor, acesso } = req.body;

  const query = 'INSERT INTO cadastro (usuario, nome, email, senha, unidade, setor, acesso) VALUES (?, ?, ?, ?, ?, ?, ?)';
  db.query(query, [usuario, nome, email, senha, unidade, setor, acesso], (err, result) => {
    
    if (err) {
      console.log(err);
      return res.send({ success: false, message: err.message });
    }

    res.send({ success: true });
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



app.post('/payment_notification', (req, res) => {
  // Extraia os detalhes do pagamento do corpo da requisição
  const { id, email, cursos, valor } = req.body;

  // Query para inserir os detalhes do pagamento no banco de dados
  const query = 'INSERT INTO pagamentos (id, email, cursos, valor) VALUES (?, ?, ?, ?)';
  
  // Execute a query
  db.query(query, [id, email, cursos, valor], (err, result) => {
    if (err) {
      console.log(err);
      return res.status(500).send({ success: false, message: err.message });
    }
    res.send({ success: true });
  });
});


mercadopago.configure({
  access_token: 'TEST-2684905602430236-052513-51d07b1caa42a7938ab7e2a9f13a7f98-135153905',
});

app.post('/create_preference', async (req, res) => {
  const { title, price, quantity } = req.body;

  const preference = {
    items: [
      {
        title,
        unit_price: Number(price),
        quantity: Number(quantity),
      },
    ],
  };

  try {
    const response = await mercadopago.preferences.create(preference); // Correção aqui
    res.json({ id: response.body.id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/webhook', async (req, res) => {
  console.log("Received a webhook event", req.body);  

  const event = req.body;

  if (event.action === "payment.created") {
    try {
      // Fetch payment details from Mercado Pago API
      const payment = await mercadopago.payment.findById(event.data.id);

      // Check if payment and payer exist and the payment is approved
      if (payment.body && payment.body.payer && payment.body.status === 'approved') {
        const email = payment.body.payer.email;
        const sessionId = payment.body.id;
        const courses = payment.body.additional_info.items;
        const amount = payment.body.transaction_amount;

        console.log("Saving checkout data", {sessionId, email, courses, amount});  

        const query = 'INSERT INTO checkout (session_id, email, cursos, valor) VALUES (?, ?, ?, ?)';
        db.query(query, [sessionId, email, JSON.stringify(courses), amount], (err, result) => {
          if (err) {
              console.error('Error inserting checkout data into the database: ', err);
              return res.status(500).send({ success: false, message: err.message });
          }
          console.log("Query result: ", result);
          console.log("Successfully saved checkout data");
          res.send({ success: true });
        });
      } else {
        console.log("Payment not approved, ignoring");
      }
    } catch (error) {
      console.error('Error fetching payment details from Mercado Pago API: ', error);
    }
  } else {
    console.log("Webhook event not relevant, ignoring");
  }

  res.status(200).end();
});




const port = process.env.PORT || 5000;

app.listen(port, () => console.log(`Server is running on port ${port}`));