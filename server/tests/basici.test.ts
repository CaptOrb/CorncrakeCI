// just testing ts-jest
//import request from "supertest";
//import express from 'express';

test("adds 1 + 2 to equal 3", (): void => {
  const one: number = 1;
  const two: number = 2;
  expect(one + two).toBe(3);
});
