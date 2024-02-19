const AWS = require('aws-sdk');
const { createCipheriv, createDecipheriv } = require('crypto');
const dotenv = require('dotenv');
require('aws-sdk/lib/maintenance_mode_message').suppress = true;
dotenv.config();

// Configura as credenciais da AWS
/*AWS.config.update({
    accessKeyId: process.env.AWS_ACCESS_KEY,
    secretAccessKey: process.env.AWS_SECRET_KEY,
    region: 'sa-east-1'
});*/

const s3 = new AWS.S3();  

exports.handler = async (event) => {
    try {
      
        const bucketName = process.env.AWS_BUCKET_NAME;
        const folderPrefix = process.env.AWS_FOLDER_PREFIX;
        const desiredExtension = '.txt';


        const data = await s3.listObjects({ Bucket: bucketName, Prefix: folderPrefix }).promise();

        const objectsWithDesiredExtension = data.Contents.filter(object => object.Key.endsWith(desiredExtension));
  
        console.log('Arquivos encontrados para processamento: ', objectsWithDesiredExtension);


        for (const objectKey of objectsWithDesiredExtension) {
            console.log(``);
            console.log(`Processando o arquivo ${objectKey.Key}`);

            // Verifica se o arquivo já foi processado ou não possui tags
            const tags = await s3.getObjectTagging({ Bucket: bucketName, Key: objectKey.Key }).promise();
            console.log(tags);

            if (!tags.TagSet || !tags.TagSet.some(tag => tag.Key === 'Finish')) {

                // Lê o conteúdo do arquivo
                const s3Object = await s3.getObject({ Bucket: bucketName, Key: objectKey.Key }).promise();
                const fileContent = s3Object.Body.toString('utf-8');
                console.log(``);
                console.log('Conteúdo do arquivo: ' + fileContent);

                // Verifica se o arquivo está marcado como Decrypt
                if (tags.TagSet && tags.TagSet.some(tag => tag.Key === 'Decrypted')) {

                    console.log(`************************************************`);
                    console.log(`**              Descriptografar               **`);
                    console.log(`************************************************`);

                    //Descriptografa o texto do arquivo
                    const encryptedContent = decryptText(fileContent.toString());

                    // Atualiza o arquivo com o conteúdo descriptografado e marca a tag como Finish
                    await putObject(bucketName, objectKey.Key, encryptedContent);

                    await updateObjectTags(bucketName, objectKey.Key, { Finish: 'true' });
                    console.log(``);
                    console.log(`Arquivo ${objectKey.Key} descriptografado e marcado como Finish.`);
                    console.log('Conteúdo Final:', encryptedContent.toString());

                } else {

                    console.log(`************************************************`);
                    console.log(`**                Criptografar                **`);
                    console.log(`************************************************`);

                    // Criptografa o conteúdo do arquivo
                    const encryptedContent = encryptText(fileContent.toString());

                    // Atualiza o arquivo com o conteúdo criptografado e marca como Finish
                    await putObject(bucketName, objectKey.Key, encryptedContent);
                    console.log(``);
                    console.log('Conteúdo do arquivo substituído pela criptografia: ' + encryptedContent);

                    await updateObjectTags(bucketName, objectKey.Key, { Finish: 'true' });
                    console.log(``);
                    console.log(`Tags do objeto atualizadas com sucesso.`);

                    console.log(``);
                    console.log(`Arquivo ${objectKey.Key} criptografado e marcado como Finish.`);
                }
            } else {
                console.log(``);
                console.log(`Ignorado! Arquivo ${objectKey.Key} já foi processado.`);
            }
        }
    } catch (err) {
        console.error('Erro:', err);
        throw err;
    }
};

async function putObject(bucket, key, content) {
    const params = {
        Bucket: bucket,
        Key: key,
        Body: content
    };
    await s3.putObject(params).promise();
}

async function updateObjectTags(bucket, key, tags) {
    const params = {
        Bucket: bucket,
        Key: key,
        Tagging: {
            TagSet: Object.keys(tags).map(key => ({ Key: key, Value: tags[key] }))
        }
    };
    await s3.putObjectTagging(params).promise();
}

function encryptText(text) {
    const cipher = createCipheriv('aes-256-cbc', Buffer.from(process.env.ENCRYPTION_KEY), Buffer.from(process.env.ENCRYPTION_IV));
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return encrypted;
}

function decryptText(encryptedText) {
    const decipher = createDecipheriv('aes-256-cbc', Buffer.from(process.env.ENCRYPTION_KEY), Buffer.from(process.env.ENCRYPTION_IV));
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}


exports.handler();