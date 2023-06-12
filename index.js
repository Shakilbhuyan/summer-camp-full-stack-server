const express = require('express');
const cors = require('cors');
require('dotenv').config();
const stripe = require('stripe')(process.env.PAYMENT_KEY)
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');
const app = express();
const port = process.env.PORT || 5000




// middleware
app.use(cors())
app.use(express.json());

const verifyJWT = (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res.status(401).send({ error: true, message: 'unauthorized access' });
  }
  // bearer token
  const token = authorization.split(' ')[1];

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).send({ error: true, message: 'unauthorized access' })
    }
    req.decoded = decoded;
    next();
  })
}




const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.8o8vfkj.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    const usersCollections = client.db('summerCamp').collection('users');
    const classCollections = client.db('summerCamp').collection('classes');
    const cartCollections = client.db('summerCamp').collection('carts');
    const paymentCollections = client.db('summerCamp').collection('payments');


    // verify  admin
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email }
      const user = await usersCollections.findOne(query);
      if (user?.role !== 'admin') {
        return res.status(404).send({ error: true, message: 'forbidden messsage' })
      }
      next()
    };

// jwt api
    app.post('/jwt', (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' })

      res.send({ token })
    })


    // users Related Api
    app.post('/users', async (req, res) => {
      const user = req.body;
      const query = { email: user.email };
      const existingUser = await usersCollections.findOne(query);
      if (existingUser) {
        return res.send({ message: 'user alreday exists' })
      }
      const result = await usersCollections.insertOne(user);
      res.send(result);
    });

    // get all user by Admin 
    app.get('/users', verifyJWT, async (req, res) => {
      const result = await usersCollections.find().toArray();
      res.send(result)
    });

    // All Classes

    app.get('/allclasses', async (req, res) => {
      const result = await classCollections.find().toArray();
      res.send(result)
    })


    // Add to cart
    app.post('/carts', async (req, res) => {
      const item = req.body;
      const result = await cartCollections.insertOne(item);
      res.send(result)
    });

    // gets carts by email
    app.get('/carts', verifyJWT, async (req, res) => {
      const email = req.query.email;
      if (!email) {
        res.send([])
      }

      const decodedEmail = req.decoded.email;

      if (email !== decodedEmail) {
        return res.status(403).send({ error: true, message: 'Forbidden access' })
      }

      const query = { email: email };
      const result = await cartCollections.find(query).toArray();
      res.send(result)
    });

    // delete carts
    app.delete('/carts/:id', async (req, res) => {
      const id = req.params.id;
      console.log(id)
      const query = { _id: new ObjectId(id) }
      const result = await cartCollections.deleteOne(query);
      res.send(result)
    });

    // Make admin patch
    app.patch('/users/admin/:id',verifyJWT, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) }
      const updateDoc = {
        $set: {
          role: 'admin'
        },
      };
      const result = await usersCollections.updateOne(filter, updateDoc);
      res.send(result)
    });

// For useAdmin hook
    app.get('/users/admin/:email', verifyJWT, async (req, res) => {
      const email = req.params.email;

      if (req.decoded.email !== email) {
        return res.send({ admin: false })
      }

      const query = { email: email };
      const user = await usersCollections.findOne(query);
      const result = { admin: user?.role === 'admin' }
      res.send(result)
    });
    // Instructor hook
    app.get('/users/instructor/:email',verifyJWT, async (req, res) => {
      const email = req.params.email;

      if (req.decoded.email !== email) {
        return res.send({ instructor: false })
      }

      const query = { email: email };
      const user = await usersCollections.findOne(query);
      const result = { instructor: user?.role === 'instructor' }
      res.send(result)
    });

// Make instructor
    app.patch('/users/instructor/:id', async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) }
      const updateDoc = {
        $set: {
          role: 'instructor'
        },
      };
      const result = await usersCollections.updateOne(filter, updateDoc);
      res.send(result)
    });
    
// Post Class
app.post('/newclass', verifyJWT, async (req, res) => {
  const newItem = req.body;
  // console.log(newItem)
  const result = await classCollections.insertOne(newItem);
  res.send(result)
});

// Creat payments intent
 // create payment intent
 app.post('/create-payment-intent', verifyJWT, async (req, res) => {
  const { price } = req.body;
  const amount = parseInt(price * 100);
  const paymentIntent = await stripe.paymentIntents.create({
    amount: amount,
    currency: 'usd',
    payment_method_types: ['card']
  });

  res.send({
    clientSecret: paymentIntent.client_secret
  })
});
app.post('/payments', verifyJWT, async (req, res) => {
  const payment = req.body;
  const insertResult = await paymentCollections.insertOne(payment);

  res.send({ insertResult });
});

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run();


app.get('/', (req, res) => {
  res.send('School is Open!!!!')
});

app.listen(port, () => {
  console.log(`server is Running on Port ${port}`)
})

