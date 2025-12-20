const express = require('express');
const cors = require('cors');
const app = express()
const port = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config();
const admin = require("firebase-admin");
const stripe = require('stripe')(process.env.STRIPE_SECRET);

// -----------firebase-project setting- service account----
const serviceAccount = require("./scholarstream-2217c-firebase-adminsdk-fbsvc-f2577185a5.json");

admin.initializeApp({

    credential: admin.credential.cert(serviceAccount)

});
// --------------------------------------------------------

//---------------tracking id------------------------------------
function generateTrackingID() {
    const date = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `ZP-${date}-${random}`;
}
// ------------------------------------------------------

//middleware-------------------------
app.use(cors());
app.use(express.json());

const verifayFBtoken = async (req, res, next) => {
    const token = req.headers.authorization;
    if (!token) {
        return res.status(401).send({ message: "unauthorized token" })
    }
    try {
        const idToken = token.split(' ')[1];
        const decoded = await admin.auth().verifyIdToken(idToken)
        console.log("decode in the token for Firebase Servise verifications", decoded);
        req.decoded_email = decoded.email;
        next();
    }
    catch (error) {
        return res.status(401).send({ message: "unauthorized token" })
    }

}
// -----------------------------------------------------------

const uri = `mongodb+srv://${process.env.USER_NAME}:${process.env.USER_PASS}@meaningfull1.roiudgk.mongodb.net/?appName=meaningfull1`;

const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {

        await client.connect();

        //collections:
        const myDB = client.db("ScholarStream");
        const userCollection = myDB.collection('users');
        const scholarshipsCollection = myDB.collection('scholarships');
        const applicationsCollection = myDB.collection('applications');
        const reviewsCollection = myDB.collection('reviews');
        const paymentCollections = myDB.collection('payment');

        //mongoDB remove duplicate transaction for paymentCollections:
        await paymentCollections.createIndex({transactionId : 1}, {unique : true});
       


        //---------------users Related Apis-----------------------
        app.get('/users', verifayFBtoken, async (req, res) => {
            const email = req.query.email;
            const query = {};
            if (email) {
                query.email = email
            };
            if (email !== req.decoded_email) {
                return res.status(403).send({ message: "Forbiddne Access" })
            }
            const cursor = userCollection.find(query);
            const result = await cursor.toArray();
            res.send(result)
        })
        
        app.post('/users', async (req, res) => {
            const user = req.body;
            user.role = "student"
            user.createAT = new Date();

            const email = user.email;
            const existingUser = await userCollection.findOne({ email });
            if (existingUser) {
                return res.send({ message: "user is already existed" })
            }

            const result = await userCollection.insertOne(user);
            res.send(result)
        })
        // -------------scholarships related apis---------------------
        app.get("/scholarships", async (req, res) => {
            const email = req.query.email;
            const query = {};
            if (email) {
                query.email = email
            }

            const cursor = scholarshipsCollection.find(query);
            const result = await cursor.toArray();
            res.send(result)
        })
        app.get("/selected-scholarships/:id", async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await scholarshipsCollection.findOne(query);
            res.send(result);
        })

        app.post("/scholarships", async (req, res) => {
            const scholarships = req.body;
            scholarships.createAT = new Date();
            const result = await scholarshipsCollection.insertOne(scholarships);
            res.send(result);
        })

        app.patch("/scholarships/:id", async(req, res)=> {
            const id = req.params.id;
            const recived = req.body;
            const query = {_id: new ObjectId(id)};
            const update = {
                $set : {
                    ...recived
                }
            }
            const result = await scholarshipsCollection.updateOne(query, update);
            res.send(result);
        } )

        app.delete("/scholarships/:id", async(req, res)=> {
            const id = req.params.id;
            const query = {_id: new ObjectId(id)}
            const result = await scholarshipsCollection.deleteOne(query);
            res.send(result);
        })

        //----------------------application collections-----------------
        app.get("/applications", async (req, res) => {
            const userEmail = req.query.userEmail;
            const query = {};
            if (userEmail) {
                query.userEmail = userEmail;
            }
            const cursor = applicationsCollection.find(query).sort({ applicationDate: -1 });
            const result = await cursor.toArray();
            res.send(result);
        })
        app.post("/applications", async (req, res) => {
            const application = req.body;
            application.applicationStatus = "pending";
            application.paymentStatus = "unpaid";
            application.feedback = "";
            application.applicationDate = new Date();

            const result = await applicationsCollection.insertOne(application);
            result.insertedId.toString();
            res.send(result)
        })

        app.delete('/application/:id', async(req, res)=> {
            const id = req.params.id;
            const query = {_id : new ObjectId(id)};
            const result = await applicationsCollection.deleteOne(query);
            res.send(result);
        })

        //------------------------review collections----------------
        app.get("/review/:scholarshipId", async (req, res) => {
            const scholarshipId = req.params.scholarshipId;
            const query = { scholarshipId: scholarshipId };
            const cursor = reviewsCollection.find(query).sort({ date: -1 });
            const result = await cursor.toArray();
            res.send(result);
        })
        app.get("/my-review", async(req, res)=> {
            const reviewerName = req.query.reviewerName;
            const query = {reviewerName: reviewerName};
            if(reviewerName){
                query.reviewerName = reviewerName;
            }
            const cursor = reviewsCollection.find(query);
            const result = await cursor.toArray();
            res.send(result);
        })
        app.post("/review", async (req, res) => {
            const review = req.body;
            review.date = new Date();
            const result = await reviewsCollection.insertOne(review);
            res.send(result);
        })
        app.patch("/review/:id", async(req, res)=> {
            const id = req.params.id;
            const data = req.body;
            const query = {_id: new ObjectId(id)};
            const update = {
                $set: {
                    rating: data.rating,
                    comment: data.comment
                }
            }
            const result = await reviewsCollection.updateOne(query, update);
            res.send(result);
        })
        app.delete("/review/:id", async(req, res)=> {
            const id = req.params.id;
            const query = {_id: new ObjectId(id)};
            const result = await reviewsCollection.deleteOne(query);
            res.send(result);
        })
        //--------------------Payment Related Apis-----------------
        app.post('/create-checkout-session', async (req, res) => {
            const paymentInfo = req.body;
            const amount = parseInt(paymentInfo.cost) * 100;
            const { applicationId } = paymentInfo
            const newApplicationId = applicationId.toString();
            const session = await stripe.checkout.sessions.create({
                line_items: [
                    {
                        // Provide the exact Price ID (for example, price_1234) of the product you want to sell
                        price_data: {
                            currency: "USD",
                            unit_amount: amount,
                            product_data: {
                                name: `payment to the: ${paymentInfo.scholarshipName}`,
                            }
                        },

                        quantity: 1,
                    },
                ],
                customer_email: paymentInfo.userEmail,
                metadata: {
                    newApplicationId,
                    scholarshipName: paymentInfo.scholarshipName,
                    universityName: paymentInfo.universityName,
                    userName: paymentInfo.userName,
                },
                mode: 'payment',
                success_url: `${process.env.STRIPE_SITE_DOMAIN}/dashboard/payment-success?session_id={CHECKOUT_SESSION_ID}`,
                cancel_url: `${process.env.STRIPE_SITE_DOMAIN}/dashboard/payment-cancelled?session_id={CHECKOUT_SESSION_ID}`,
            });

            console.log(session);
            res.send({ url: session.url })

        })

        // payment-success
        app.patch('/payment-success', async (req, res) => {
            const sessionId = req.query.session_id;
            const trackingId = generateTrackingID();

            const session = await stripe.checkout.sessions.retrieve(sessionId);
            console.log("my session id:", session);

            //exist payment check
            const transactionId = session.payment_intent;
            const query = { transactionId: transactionId };
            const existTransactionId = await paymentCollections.findOne(query);

            if (existTransactionId) {
                return res.send({ message: "the transaction id is already exist: ", transactionId, trackingId: existTransactionId.trackingId })
            }
            //  ------------------------------------------------

            if (session.payment_status === "paid") {
                const id = session.metadata.newApplicationId;

                //update:
                const query = { _id: new ObjectId(id) };
                const update = { $set: { paymentStatus: "paid", trackingId: trackingId } };

                const updateResult = await applicationsCollection.updateOne(query, update);


                // save data to the paymentCollections:'
                const paymentData = {
                    amount: session.amount_total / 100,
                    currency: session.currency,
                    customerEmail: session.customer_email,
                    applicationId: session.metadata.newApplicationId,
                    scholarshipName: session.metadata.scholarshipName,
                    universityName: session.metadata.universityName,
                    userName: session.metadata.userName,
                    transactionId: session.payment_intent,
                    paymentStatus: session.payment_status,
                    paidAt: new Date(),
                    trackingId: trackingId
                }

                const paymentResult = await paymentCollections.insertOne(paymentData);

                return res.send({
                    success: true,
                    message: "Payment Successful",
                    applicationId: session.metadata.newApplicationId,
                    scholarshipName: session.metadata.scholarshipName,
                    universityName: session.metadata.universityName,
                    userName: session.metadata.userName,
                    amountPaid: session.amount_total / 100,  
                    transactionId: session.payment_intent,
                    trackingId: trackingId,
                    modifyApplication: updateResult,
                    paymentInfo: paymentResult
                });

            }

            res.send({ success: false });

        })

        //payment-faild
        app.patch("/payment-cancelled", async (req, res) => {
            const sessionId = req.query.session_id;

            const session = await stripe.checkout.sessions.retrieve(sessionId);

            const id = session.metadata.newApplicationId;
            await applicationsCollection.updateOne(
                { _id: new ObjectId(id) },
                { $set: { paymentStatus: "reject" } }
            );
            res.send({
                success: false,
                applicationId: session.metadata.newApplicationId,
                message: "Payment Failed",
                scholarshipName: session.metadata.scholarshipName,
                error: "Transaction was cancelled"
            });
        })

        //get payment success:
        app.get("/payment-success/:transactionId", async(req, res)=> {
            const transactionId = req.params.transactionId;
            const query = {transactionId: transactionId};
            const result = await paymentCollections.findOne(query);
            res.send(result);
        })



        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {

    }
}
run().catch(console.dir);




app.get('/', (req, res) => {
    res.send('Hello World!')
})


app.listen(port, () => {
    console.log(`Example app listening on port ${port}`)
})
