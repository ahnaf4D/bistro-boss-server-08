const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const stipe = require('stripe')(process.env.STRIPE_PAYMENT_SECRET_KEY);
const app = express();
const port = process.env.PORT || 3000;
// middlewares
app.use(express.json());
app.use(
  cors({
    origin: [
      'http://localhost:5173',
      'http://localhost:5174',
      'https://ph-bistro-boss.web.app',
      'https://ph-bistro-boss.firebaseapp.com',
    ],
    credentials: true,
  })
);

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.zrua0aj.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0'`;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    const userCollection = client
      .db('bistroBossRestaurantDB')
      .collection('users');
    const menuCollection = client
      .db('bistroBossRestaurantDB')
      .collection('menu');
    const reviewCollection = client
      .db('bistroBossRestaurantDB')
      .collection('reviews');
    const cartCollection = client
      .db('bistroBossRestaurantDB')
      .collection('carts');
    const paymentCollection = client
      .db('bistroBossRestaurantDB')
      .collection('payments');
    // jwt related apis
    app.post('/jwt', (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN, {
        expiresIn: '1h',
      });
      res.send({ token });
    });
    // MiddleWares
    const verifyTokens = (req, res, next) => {
      if (!req.headers.authorization) {
        return res.status(401).send({ massage: 'unauthorized access' });
      }
      const token = req.headers.authorization.split(' ')[1];
      jwt.verify(token, process.env.ACCESS_TOKEN, (err, decoded) => {
        if (err) {
          return res.status(401).send({ massage: 'unauthorized access' });
        }
        req.decoded = decoded;
        next();
      });
    };
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      const isAdmin = user?.role === 'admin';
      if (!isAdmin) {
        return res.status(403).send({ massage: 'For bidden Access' });
      }
      next();
    };

    // user related apis
    app.get('/users', verifyTokens, verifyAdmin, async (req, res) => {
      const result = await userCollection.find().toArray();
      res.status(200).send(result);
    });
    app.get('/users/admin/:email', verifyTokens, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({ massage: 'forbidden access' });
      }
      const query = { email: email };
      const user = await userCollection.findOne(query);
      let admin = false;
      if (user) {
        admin = user?.role === 'admin';
      }
      res.send({ admin });
    });
    app.post('/users', async (req, res) => {
      const user = req.body;
      const query = { email: user.email };
      const existingUser = await userCollection.findOne(query);
      if (existingUser) {
        return res.send({ massage: 'user already exists', insertedId: null });
      }
      const result = await userCollection.insertOne(user);
      res.status(200).send(result);
    });
    app.delete('/users/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await userCollection.deleteOne(query);
      res.send(result);
    });
    app.patch('/users/admin/:id', async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          role: 'admin',
        },
      };
      const result = await userCollection.updateOne(filter, updatedDoc);
      res.status(200).send(result);
    });
    // menu related apis
    app.get('/menu', async (req, res) => {
      const result = await menuCollection.find().toArray();
      res.status(200).send(result);
    });
    app.get('/menu/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await menuCollection.findOne(query);
      res.send(result);
    });
    app.post('/menu', verifyTokens, verifyAdmin, async (req, res) => {
      const item = req.body;
      const result = await menuCollection.insertOne(item);
      res.send(result);
    });
    app.patch(`/menu/:id`, async (req, res) => {
      const item = req.body;
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          ...item,
        },
      };
      const result = await menuCollection.updateOne(filter, updatedDoc);
      res.send(result);
    });
    app.delete('/menu/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await menuCollection.deleteOne(query);
      res.send(result);
    });
    app.get('/reviews', async (req, res) => {
      const result = await reviewCollection.find().toArray();
      res.status(200).send(result);
    });
    // carts collection
    app.get('/carts', async (req, res) => {
      const email = req.query.email;
      const query = { email: email };

      const result = await cartCollection.find(query).toArray();
      res.status(200).send(result);
    });
    app.post('/carts', async (req, res) => {
      const cartItem = req.body;
      const result = await cartCollection.insertOne(cartItem);
      res.status(200).send(result);
    });
    app.delete('/cart/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await cartCollection.deleteOne(query);
      res.status(200).send(result);
    });
    // Payment Related Apis
    app.post('/create-payment-intent', async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100);
      const paymentIntent = await stipe.paymentIntents.create({
        amount: amount,
        currency: 'usd',
        payment_method_types: ['card'], // extra line
      });
      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });
    app.post('/payments', async (req, res) => {
      const payment = req.body;
      const paymentResult = await paymentCollection.insertOne(payment);
      console.log('payment info', payment);
      const query = {
        _id: {
          $in: payment.cartIds.map((id) => new ObjectId(id)),
        },
      };
      const deleteResult = await cartCollection.deleteMany(query);
      res.send({ paymentResult, deleteResult });
    });
    app.get('/payments', verifyTokens, async (req, res) => {
      const query = { email: req.query.email };
      if (req.query.email !== req.decoded.email) {
        return res.status(403).send('forbidden access');
      }
      const result = await paymentCollection.find(query).toArray();
      res.send(result);
    });

    console.log(
      'Pinged your deployment. You successfully connected to MongoDB!'
    );
  } finally {
  }
}
run().catch(console.dir);

app.get('/', (req, res) => {
  res.send('bistro boss restaurant here!!!');
});
app.listen(port, (req, res) => {
  console.log(`server listening on ${port}`);
});
// --------- Naming Convention
/***
 * app.get('/users')
 * app.get('/users/:id')
 * app.post('/users')
 * app.put('/user/:id')
 * ***/
