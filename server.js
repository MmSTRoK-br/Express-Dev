const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const mysql = require('mysql');
const mercadopago = require('mercadopago');

const app = express();

const db = mysql.createPool({
  host: '129.148.55.118',
  user: 'QualityAdmin',
  password: 'Suus0220##',
  database: 'Quality_EAD',
  connectionLimit: 10,
});

db.getConnection((err, connection) => {
  if (err) throw err;
  console.log('Conectado ao banco de dados MySQL');

  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS cadastro (
      id INT PRIMARY KEY AUTO_INCREMENT,
      email VARCHAR(255) NOT NULL,
      senha VARCHAR(255) NOT NULL,
      usuario VARCHAR(255) NOT NULL,
      nome VARCHAR(255) NOT NULL,
      unidade VARCHAR(255) NOT NULL,
      setor VARCHAR(255) NOT NULL,
      acesso VARCHAR(255) NOT NULL
    );
  `;
  
  connection.query(createTableQuery, (err, results) => {
    if (err) {
      console.error('Erro ao criar a tabela: ', err);
    } else {
      console.log('Tabela criada ou já existente.');
    }
  });

  connection.release();
});

app.use(cors());
app.use(express.json());

app.post('/login', (req, res) => {
  const { usuario, senha } = req.body;

  const query = 'SELECT * FROM cadastro WHERE usuario = ?';
  db.query(query, [usuario], (err, results) => {
    // ...

    if (senha !== user.senha) {
      return res.send({ success: false, message: 'Wrong password' });
    }

    const token = jwt.sign({ id: user.id, role: user.acesso }, 'suus02201998##', { expiresIn: '1h' });
    res.cookie('token', token, { httpOnly: true });

    // inclua o nome do usuário na resposta
    res.send({ success: true, username: user.usuario, token });
    
  });
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