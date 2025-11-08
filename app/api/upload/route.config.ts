export const config = {
  maxDuration: 300, // 5 minutes for large file uploads
  api: {
    bodyParser: {
      sizeLimit: '500mb', // 500MB upload limit
    },
    responseLimit: false,
  },
}